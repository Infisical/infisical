package ratelimit

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/services/auth"
)

type mockLicenseService struct {
	getPlanFn func(ctx context.Context, orgID string) (*license.FeatureSet, error)
}

func (m *mockLicenseService) GetPlan(ctx context.Context, orgID string) (*license.FeatureSet, error) {
	if m.getPlanFn != nil {
		return m.getPlanFn(ctx, orgID)
	}
	return &license.FeatureSet{}, nil
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestNewService_DisabledWhenNotEnabled(t *testing.T) {
	t.Parallel()

	svc := NewService(context.Background(), testLogger(), &Deps{
		Redis:      nil,
		LicenseSvc: &mockLicenseService{},
		IsCloud:    true,
		IsEnabled:  false,
	})

	assert.False(t, svc.enabled)
	assert.Nil(t, svc.counter)
	assert.Nil(t, svc.limiter)
}

func TestService_Middleware_ReturnsNoopWhenDisabled(t *testing.T) {
	t.Parallel()

	svc := NewService(context.Background(), testLogger(), &Deps{
		IsEnabled: false,
	})

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(PresetSecrets)
	wrappedHandler := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestService_GlobalMiddleware_ReturnsNoopWhenDisabled(t *testing.T) {
	t.Parallel()

	svc := NewService(context.Background(), testLogger(), &Deps{
		IsEnabled: false,
	})

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.GlobalMiddleware()
	wrappedHandler := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestService_MfaMiddleware_ReturnsNoopWhenDisabled(t *testing.T) {
	t.Parallel()

	svc := NewService(context.Background(), testLogger(), &Deps{
		IsEnabled: false,
	})

	handlerCalled := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.MfaMiddleware()
	wrappedHandler := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestService_getLimitsForRequest_ReturnsDefaultsWhenNoIdentity(t *testing.T) {
	t.Parallel()

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			t.Fatal("GetPlan should not be called when no identity")
			return nil, nil
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    true,
		enabled:    true,
		logger:     testLogger(),
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, DefaultLimits, limits)
}

func TestService_getLimitsForRequest_ReturnsDefaultsWhenOrgIDIsNil(t *testing.T) {
	t.Parallel()

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			t.Fatal("GetPlan should not be called when orgID is nil")
			return nil, nil
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    true,
		enabled:    true,
		logger:     testLogger(),
	}

	identity := &auth.Identity{
		OrgID: uuid.Nil,
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(auth.WithIdentity(req.Context(), identity))

	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, DefaultLimits, limits)
}

func TestService_getLimitsForRequest_ReturnsDefaultsWhenNotCloud(t *testing.T) {
	t.Parallel()

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			t.Fatal("GetPlan should not be called for non-cloud instances")
			return nil, nil
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    false,
		enabled:    true,
		logger:     testLogger(),
	}

	identity := &auth.Identity{
		OrgID: uuid.New(),
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(auth.WithIdentity(req.Context(), identity))

	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, DefaultLimits, limits)
}

func TestService_getLimitsForRequest_MergesPlanLimitsInCloud(t *testing.T) {
	t.Parallel()

	orgID := uuid.New()
	var capturedOrgID string

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, id string) (*license.FeatureSet, error) {
			capturedOrgID = id
			return &license.FeatureSet{
				RateLimits: license.RateLimits{
					ReadLimit:    1000,
					WriteLimit:   500,
					SecretsLimit: 100,
				},
			}, nil
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    true,
		enabled:    true,
		logger:     testLogger(),
	}

	identity := &auth.Identity{
		OrgID: orgID,
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(auth.WithIdentity(req.Context(), identity))

	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, orgID.String(), capturedOrgID)
	assert.Equal(t, 1000, limits.ReadLimit)
	assert.Equal(t, 500, limits.WriteLimit)
	assert.Equal(t, 100, limits.SecretsLimit)
	assert.Equal(t, DefaultLimits.AuthRateLimit, limits.AuthRateLimit)
	assert.Equal(t, DefaultLimits.MfaRateLimit, limits.MfaRateLimit)
	assert.Equal(t, DefaultLimits.PublicEndpointLimit, limits.PublicEndpointLimit)
}

func TestService_getLimitsForRequest_FallsBackOnLicenseError(t *testing.T) {
	t.Parallel()

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			return nil, errors.New("license server unavailable")
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    true,
		enabled:    true,
		logger:     testLogger(),
	}

	identity := &auth.Identity{
		OrgID: uuid.New(),
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(auth.WithIdentity(req.Context(), identity))

	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, DefaultLimits, limits)
}

func TestService_getLimitsForRequest_CoalescesZeroValues(t *testing.T) {
	t.Parallel()

	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			return &license.FeatureSet{
				RateLimits: license.RateLimits{
					ReadLimit:    0,
					WriteLimit:   500,
					SecretsLimit: 0,
				},
			}, nil
		},
	}

	svc := &Service{
		licenseSvc: licenseSvc,
		isCloud:    true,
		enabled:    true,
		logger:     testLogger(),
	}

	identity := &auth.Identity{
		OrgID: uuid.New(),
	}

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(auth.WithIdentity(req.Context(), identity))

	limits := svc.getLimitsForRequest(req)

	assert.Equal(t, DefaultLimits.ReadLimit, limits.ReadLimit)
	assert.Equal(t, 500, limits.WriteLimit)
	assert.Equal(t, DefaultLimits.SecretsLimit, limits.SecretsLimit)
}

func TestKeyByAuthToken_ExtractsTokenFromBearerHeader(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.Header.Set("Authorization", "Bearer my-secret-token")

	key, err := keyByAuthToken(req)

	require.NoError(t, err)
	assert.Equal(t, "my-secret-token", key)
}

func TestKeyByAuthToken_FallsBackToIPWhenNoBearer(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.RemoteAddr = "192.168.1.100:12345"

	key, err := keyByAuthToken(req)

	require.NoError(t, err)
	assert.Equal(t, "192.168.1.100", key)
}

func TestKeyByAuthToken_FallsBackToIPWhenShortHeader(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.Header.Set("Authorization", "Basic")
	req.RemoteAddr = "10.0.0.1:8080"

	key, err := keyByAuthToken(req)

	require.NoError(t, err)
	assert.Equal(t, "10.0.0.1", key)
}
