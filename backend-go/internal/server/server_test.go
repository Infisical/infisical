package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/server/middlewares"
)

func TestBuildCORSConfigUsesParsedOriginsAndSiteURL(t *testing.T) {
	s := &Server{
		config: &config.Config{
			ParsedCORSAllowedOrigins: []string{"https://example.com"},
			SiteURL:                  "https://app.example.com",
		},
	}

	cfg := s.buildCORSConfig()

	want := []string{"https://example.com", "https://app.example.com"}
	if !reflect.DeepEqual(cfg.AllowedOrigins, want) {
		t.Fatalf("expected origins %v, got %v", want, cfg.AllowedOrigins)
	}
}

func TestBuildCORSConfigUsesParsedHeaders(t *testing.T) {
	s := &Server{
		config: &config.Config{
			ParsedCORSAllowedHeaders: []string{"Authorization", "X-Custom-Header"},
		},
	}

	cfg := s.buildCORSConfig()

	want := []string{"Authorization", "X-Custom-Header"}
	if !reflect.DeepEqual(cfg.AllowedHeaders, want) {
		t.Fatalf("expected headers %v, got %v", want, cfg.AllowedHeaders)
	}
}

func TestCORSWithDocumentedJSONOriginAllowsBrowserOrigin(t *testing.T) {
	t.Setenv("AUTH_SECRET", "test-auth-secret")
	t.Setenv("DB_CONNECTION_URI", "postgres://user:pass@localhost:5432/infisical")
	t.Setenv("ENCRYPTION_KEY", "test-encryption-key")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("CORS_ALLOWED_ORIGINS", `["https://example.com"]`)

	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("expected config to load, got %v", err)
	}

	s := &Server{config: cfg}
	handler := middlewares.CORS(s.buildCORSConfig())(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://example.com" {
		t.Fatalf("expected Access-Control-Allow-Origin %q, got %q", "https://example.com", got)
	}
}
