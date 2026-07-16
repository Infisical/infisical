//go:build integration

package ratelimit_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"

	"github.com/infisical/api/internal/ee/services/license"
	"github.com/infisical/api/internal/ee/services/ratelimit"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/tests/infra"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		MustStart()

	code := m.Run()

	stack.Stop()

	if code == 0 {
		if err := goleak.Find(
			goleak.IgnoreTopFunction("github.com/redis/go-redis/v9/internal/pool.(*ConnPool).reaper"),
		); err != nil {
			fmt.Fprintf(os.Stderr, "goleak: %v\n", err)
			os.Exit(1)
		}
	}

	os.Exit(code)
}

type mockLicenseService struct {
	getPlanFn func(ctx context.Context, orgID string) (*license.FeatureSet, error)
}

func (m *mockLicenseService) GetPlan(ctx context.Context, orgID string) (*license.FeatureSet, error) {
	if m.getPlanFn != nil {
		return m.getPlanFn(ctx, orgID)
	}
	return &license.FeatureSet{}, nil
}

func newTestService(t *testing.T, isCloud bool) *ratelimit.Service {
	t.Helper()
	return ratelimit.NewService(context.Background(), infra.NopLogger(), &ratelimit.Deps{
		Redis:      stack.Redis().Client(),
		LicenseSvc: &mockLicenseService{},
		IsCloud:    isCloud,
		IsEnabled:  true,
	})
}

// ==========================================================================
// Counter Integration Tests
// ==========================================================================

func TestRedisCounter_IncrementAndGet_BasicFlow(t *testing.T) {
	client := stack.Redis().Client()
	defer client.Close()

	counter := ratelimit.NewRedisCounter(&ratelimit.RedisCounterConfig{
		Client:    client,
		PrefixKey: "test-basic-" + t.Name(),
		Logger:    infra.NopLogger(),
	})
	counter.Config(100, time.Minute)

	window := time.Now().UTC().Truncate(time.Minute)
	prevWindow := window.Add(-time.Minute)

	err := counter.Increment("test-key", window)
	require.NoError(t, err)

	err = counter.Increment("test-key", window)
	require.NoError(t, err)

	curr, prev, err := counter.Get("test-key", window, prevWindow)
	require.NoError(t, err)

	assert.Equal(t, 2, curr)
	assert.Equal(t, 0, prev)
}

func TestRedisCounter_Get_ReturnsZeroForNewKey(t *testing.T) {
	client := stack.Redis().Client()
	defer client.Close()

	counter := ratelimit.NewRedisCounter(&ratelimit.RedisCounterConfig{
		Client:    client,
		PrefixKey: "test-zero-" + t.Name(),
		Logger:    infra.NopLogger(),
	})
	counter.Config(100, time.Minute)

	window := time.Now().UTC().Truncate(time.Minute)
	prevWindow := window.Add(-time.Minute)

	curr, prev, err := counter.Get("nonexistent-key", window, prevWindow)
	require.NoError(t, err)

	assert.Equal(t, 0, curr)
	assert.Equal(t, 0, prev)
}

func TestRedisCounter_SeparateWindows_HaveIndependentCounts(t *testing.T) {
	client := stack.Redis().Client()
	defer client.Close()

	counter := ratelimit.NewRedisCounter(&ratelimit.RedisCounterConfig{
		Client:    client,
		PrefixKey: "test-windows-" + t.Name(),
		Logger:    infra.NopLogger(),
	})
	counter.Config(100, time.Minute)

	window1 := time.Now().UTC().Truncate(time.Minute)
	window2 := window1.Add(-time.Minute)

	err := counter.Increment("key", window1)
	require.NoError(t, err)
	err = counter.Increment("key", window1)
	require.NoError(t, err)
	err = counter.Increment("key", window1)
	require.NoError(t, err)

	err = counter.Increment("key", window2)
	require.NoError(t, err)

	curr, prev, err := counter.Get("key", window1, window2)
	require.NoError(t, err)

	assert.Equal(t, 3, curr)
	assert.Equal(t, 1, prev)
}

func TestRedisCounter_DifferentKeys_HaveIndependentCounts(t *testing.T) {
	client := stack.Redis().Client()
	defer client.Close()

	counter := ratelimit.NewRedisCounter(&ratelimit.RedisCounterConfig{
		Client:    client,
		PrefixKey: "test-keys-" + t.Name(),
		Logger:    infra.NopLogger(),
	})
	counter.Config(100, time.Minute)

	window := time.Now().UTC().Truncate(time.Minute)
	prevWindow := window.Add(-time.Minute)

	err := counter.Increment("ip-1", window)
	require.NoError(t, err)
	err = counter.Increment("ip-1", window)
	require.NoError(t, err)

	err = counter.Increment("ip-2", window)
	require.NoError(t, err)

	curr1, _, err := counter.Get("ip-1", window, prevWindow)
	require.NoError(t, err)
	assert.Equal(t, 2, curr1)

	curr2, _, err := counter.Get("ip-2", window, prevWindow)
	require.NoError(t, err)
	assert.Equal(t, 1, curr2)
}

func TestRedisCounter_IncrementBy_IncrementsCorrectAmount(t *testing.T) {
	client := stack.Redis().Client()
	defer client.Close()

	counter := ratelimit.NewRedisCounter(&ratelimit.RedisCounterConfig{
		Client:    client,
		PrefixKey: "test-incrby-" + t.Name(),
		Logger:    infra.NopLogger(),
	})
	counter.Config(100, time.Minute)

	window := time.Now().UTC().Truncate(time.Minute)
	prevWindow := window.Add(-time.Minute)

	err := counter.IncrementBy("key", window, 5)
	require.NoError(t, err)

	err = counter.IncrementBy("key", window, 3)
	require.NoError(t, err)

	curr, _, err := counter.Get("key", window, prevWindow)
	require.NoError(t, err)
	assert.Equal(t, 8, curr)
}

// ==========================================================================
// Middleware Integration Tests
// ==========================================================================

func TestRateLimitMiddleware_AllowsRequestsUnderLimit(t *testing.T) {
	svc := newTestService(t, true)

	handlerCallCount := 0
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCallCount++
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(ratelimit.PresetSecrets)
	wrappedHandler := middleware(handler)

	for i := 0; i < 5; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.RemoteAddr = "192.168.1.100:12345"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)

		assert.Equal(t, http.StatusOK, rec.Code, "request %d should succeed", i)
	}

	assert.Equal(t, 5, handlerCallCount)
}

func TestRateLimitMiddleware_BlocksAfterLimitExceeded(t *testing.T) {
	svc := newTestService(t, true)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(ratelimit.PresetMfa)
	wrappedHandler := middleware(handler)

	ip := "10.0.0.1:8080"
	successCount := 0
	blockedCount := 0

	for i := 0; i < 25; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.RemoteAddr = ip
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)

		switch rec.Code {
		case http.StatusOK:
			successCount++
		case http.StatusTooManyRequests:
			blockedCount++
		}
	}

	assert.Equal(t, ratelimit.DefaultLimits.MfaRateLimit, successCount)
	assert.Equal(t, 25-ratelimit.DefaultLimits.MfaRateLimit, blockedCount)
}

func TestRateLimitMiddleware_ReturnsRateLimitHeaders(t *testing.T) {
	svc := newTestService(t, true)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(ratelimit.PresetRead)
	wrappedHandler := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.RemoteAddr = "172.16.0.1:9999"
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.NotEmpty(t, rec.Header().Get("X-RateLimit-Limit"))
	assert.NotEmpty(t, rec.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, rec.Header().Get("X-RateLimit-Reset"))
}

func TestRateLimitMiddleware_DifferentIPsHaveIndependentLimits(t *testing.T) {
	svc := newTestService(t, true)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(ratelimit.PresetMfa)
	wrappedHandler := middleware(handler)

	ip1SuccessCount := 0
	for i := 0; i < 25; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.RemoteAddr = "10.1.1.1:8080"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			ip1SuccessCount++
		}
	}

	ip2SuccessCount := 0
	for i := 0; i < 25; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.RemoteAddr = "10.2.2.2:8080"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			ip2SuccessCount++
		}
	}

	assert.Equal(t, ratelimit.DefaultLimits.MfaRateLimit, ip1SuccessCount)
	assert.Equal(t, ratelimit.DefaultLimits.MfaRateLimit, ip2SuccessCount)
}

func TestRateLimitMiddleware_UsesDynamicLimitFromPlan(t *testing.T) {
	licenseSvc := &mockLicenseService{
		getPlanFn: func(ctx context.Context, orgID string) (*license.FeatureSet, error) {
			return &license.FeatureSet{
				RateLimits: license.RateLimits{
					SecretsLimit: 5,
				},
			}, nil
		},
	}

	svc := ratelimit.NewService(context.Background(), infra.NopLogger(), &ratelimit.Deps{
		Redis:      stack.Redis().Client(),
		LicenseSvc: licenseSvc,
		IsCloud:    true,
		IsEnabled:  true,
	})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.Middleware(ratelimit.PresetSecrets)
	wrappedHandler := middleware(handler)

	identity := &auth.Identity{
		OrgID: [16]byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16},
	}

	successCount := 0
	for i := 0; i < 10; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req = req.WithContext(auth.WithIdentity(req.Context(), identity))
		req.RemoteAddr = "10.99.99.99:8080"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			successCount++
		}
	}

	assert.Equal(t, 5, successCount, "should allow exactly 5 requests based on plan limit")
}

func TestRateLimitMiddleware_GlobalMiddleware_AppliesDefaultLimit(t *testing.T) {
	svc := newTestService(t, true)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.GlobalMiddleware()
	wrappedHandler := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.RemoteAddr = "10.50.50.50:8080"
	rec := httptest.NewRecorder()

	wrappedHandler.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "600", rec.Header().Get("X-RateLimit-Limit"))
}

func TestMfaMiddleware_KeysByAuthToken(t *testing.T) {
	svc := newTestService(t, true)

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := svc.MfaMiddleware()
	wrappedHandler := middleware(handler)

	token1SuccessCount := 0
	for i := 0; i < 25; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.Header.Set("Authorization", "Bearer token-user-1-unique")
		req.RemoteAddr = "10.0.0.1:8080"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			token1SuccessCount++
		}
	}

	token2SuccessCount := 0
	for i := 0; i < 25; i++ {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
		req.Header.Set("Authorization", "Bearer token-user-2-unique")
		req.RemoteAddr = "10.0.0.1:8080"
		rec := httptest.NewRecorder()

		wrappedHandler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			token2SuccessCount++
		}
	}

	assert.Equal(t, ratelimit.DefaultLimits.MfaRateLimit, token1SuccessCount)
	assert.Equal(t, ratelimit.DefaultLimits.MfaRateLimit, token2SuccessCount)
}
