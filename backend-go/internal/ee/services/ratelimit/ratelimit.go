package ratelimit

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/httprate"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/services/auth"
)

const (
	defaultWindowLength = time.Minute
	defaultPrefixKey    = "httprate"
)

// LicenseService defines the interface for fetching organization plans.
type LicenseService interface {
	GetPlan(ctx context.Context, orgID string) (*license.FeatureSet, error)
}

// Service provides rate limiting middleware with plan-based dynamic limits.
type Service struct {
	counter    *RedisCounter
	limiter    *httprate.RateLimiter
	licenseSvc LicenseService
	isCloud    bool
	enabled    bool
	logger     *slog.Logger
}

// Deps holds the dependencies for the rate limit service.
type Deps struct {
	Redis      redis.UniversalClient
	LicenseSvc LicenseService
	IsCloud    bool
	IsEnabled  bool
}

// NewService creates a new rate limit service.
// Rate limiting is only active when enabled (cloud + production).
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	if !deps.IsEnabled {
		return &Service{
			enabled: false,
			logger:  logger,
		}
	}

	counter := NewRedisCounter(&RedisCounterConfig{
		Client:    deps.Redis,
		PrefixKey: defaultPrefixKey,
		Logger:    logger,
	})

	limiter := httprate.NewRateLimiter(
		DefaultLimits.ReadLimit,
		defaultWindowLength,
		httprate.WithKeyFuncs(httprate.KeyByRealIP),
		httprate.WithLimitCounter(counter),
		httprate.WithLimitHandler(rateLimitedHandler),
	)

	return &Service{
		counter:    counter,
		limiter:    limiter,
		licenseSvc: deps.LicenseSvc,
		isCloud:    deps.IsCloud,
		enabled:    true,
		logger:     logger,
	}
}

// Middleware returns rate limit middleware for the given preset.
// It chains: InjectLimit (sets dynamic limit in context) → httprate limiter.
func (s *Service) Middleware(preset Preset) func(http.Handler) http.Handler {
	if !s.enabled {
		return noopMiddleware
	}

	return func(next http.Handler) http.Handler {
		// Chain: inject limit → apply rate limiter
		return s.injectLimit(preset)(s.limiter.Handler(next))
	}
}

// GlobalMiddleware returns the baseline rate limiter (600/min).
// Use this for routes that don't need plan-based dynamic limits.
func (s *Service) GlobalMiddleware() func(http.Handler) http.Handler {
	if !s.enabled {
		return noopMiddleware
	}
	return s.limiter.Handler
}

// injectLimit returns middleware that sets the rate limit in context based on preset and plan.
func (s *Service) injectLimit(preset Preset) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			limits := s.getLimitsForRequest(r)
			limit := limits.Get(preset)

			ctx := httprate.WithRequestLimit(r.Context(), limit)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// getLimitsForRequest resolves rate limits for the current request.
// For authenticated requests in cloud, it merges plan overrides with defaults.
func (s *Service) getLimitsForRequest(r *http.Request) Limits {
	identity, err := auth.IdentityFromContext(r.Context())
	if err != nil || identity.OrgID == uuid.Nil {
		return DefaultLimits
	}

	if !s.isCloud {
		return DefaultLimits
	}

	plan, err := s.licenseSvc.GetPlan(r.Context(), identity.OrgID.String())
	if err != nil {
		s.logger.WarnContext(r.Context(), "failed to get plan for rate limiting",
			slog.String("orgID", identity.OrgID.String()),
			slog.Any("error", err),
		)
		return DefaultLimits
	}

	return Limits{
		ReadLimit:             coalesce(plan.RateLimits.ReadLimit, DefaultLimits.ReadLimit),
		WriteLimit:            coalesce(plan.RateLimits.WriteLimit, DefaultLimits.WriteLimit),
		SecretsLimit:          coalesce(plan.RateLimits.SecretsLimit, DefaultLimits.SecretsLimit),
		AuthRateLimit:         DefaultLimits.AuthRateLimit,
		MfaRateLimit:          DefaultLimits.MfaRateLimit,
		PublicEndpointLimit:   DefaultLimits.PublicEndpointLimit,
		InviteUserRateLimit:   DefaultLimits.InviteUserRateLimit,
		IdentityCreationLimit: DefaultLimits.IdentityCreationLimit,
		ProjectCreationLimit:  DefaultLimits.ProjectCreationLimit,
	}
}

// MfaMiddleware returns rate limit middleware for MFA endpoints.
// Keys by authorization token instead of IP address.
func (s *Service) MfaMiddleware() func(http.Handler) http.Handler {
	if !s.enabled {
		return noopMiddleware
	}

	mfaLimiter := httprate.NewRateLimiter(
		DefaultLimits.MfaRateLimit,
		defaultWindowLength,
		httprate.WithKeyFuncs(keyByAuthToken),
		httprate.WithLimitCounter(s.counter),
		httprate.WithLimitHandler(rateLimitedHandler),
	)

	return func(next http.Handler) http.Handler {
		return s.injectLimit(PresetMfa)(mfaLimiter.Handler(next))
	}
}

// keyByAuthToken extracts the bearer token from the Authorization header for rate limiting.
// Falls back to IP if no token present.
func keyByAuthToken(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		return authHeader[7:], nil
	}
	return httprate.KeyByRealIP(r)
}

func rateLimitedHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusTooManyRequests)
	_, _ = w.Write([]byte(`{"statusCode":429,"message":"Rate limit exceeded. Please try again later."}`))
}

func noopMiddleware(next http.Handler) http.Handler {
	return next
}

func coalesce(val, fallback int) int {
	if val > 0 {
		return val
	}
	return fallback
}
