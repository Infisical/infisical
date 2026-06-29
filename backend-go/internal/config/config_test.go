package config

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestParseStringListEnvJSONArray(t *testing.T) {
	got, issues := parseStringListEnv(`["https://example.com"]`, "CORS_ALLOWED_ORIGINS")

	if len(issues) > 0 {
		t.Fatalf("expected no issues, got %v", issues)
	}

	want := []string{"https://example.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseStringListEnvJSONArrayMultipleValues(t *testing.T) {
	got, issues := parseStringListEnv(`["https://a.com","https://b.com"]`, "CORS_ALLOWED_ORIGINS")

	if len(issues) > 0 {
		t.Fatalf("expected no issues, got %v", issues)
	}

	want := []string{"https://a.com", "https://b.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseStringListEnvCommaSeparated(t *testing.T) {
	got, issues := parseStringListEnv("https://a.com, https://b.com", "CORS_ALLOWED_ORIGINS")

	if len(issues) > 0 {
		t.Fatalf("expected no issues, got %v", issues)
	}

	want := []string{"https://a.com", "https://b.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseStringListEnvRejectsMalformedJSONArray(t *testing.T) {
	_, issues := parseStringListEnv(`["https://example.com"`, "CORS_ALLOWED_ORIGINS")

	if len(issues) != 1 {
		t.Fatalf("expected one issue, got %v", issues)
	}
	if !strings.Contains(issues[0], "CORS_ALLOWED_ORIGINS") {
		t.Fatalf("expected issue to mention env var, got %q", issues[0])
	}
}

func TestParseStringListEnvRejectsNonArrayJSON(t *testing.T) {
	_, issues := parseStringListEnv(`{"origin":"https://example.com"}`, "CORS_ALLOWED_ORIGINS")

	if len(issues) != 1 {
		t.Fatalf("expected one issue, got %v", issues)
	}
	if !strings.Contains(issues[0], "CORS_ALLOWED_ORIGINS") {
		t.Fatalf("expected issue to mention env var, got %q", issues[0])
	}
}

func TestLoadConfigRejectsMalformedCORSAllowedOrigins(t *testing.T) {
	t.Setenv("NODE_ENV", "production")
	t.Setenv("AUTH_SECRET", "test-auth-secret")
	t.Setenv("DB_CONNECTION_URI", "postgres://user:pass@localhost:5432/infisical")
	t.Setenv("ENCRYPTION_KEY", "test-encryption-key")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("CORS_ALLOWED_ORIGINS", `["https://example.com"`)
	t.Setenv("CORS_ALLOWED_HEADERS", "")
	t.Setenv("DB_READ_REPLICAS", "")

	_, err := LoadConfig()

	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	if len(validationErr.Issues) != 1 {
		t.Fatalf("expected one validation issue, got %v", validationErr.Issues)
	}
	if !strings.Contains(validationErr.Issues[0], "CORS_ALLOWED_ORIGINS") {
		t.Fatalf("expected issue to mention env var, got %q", validationErr.Issues[0])
	}
}
