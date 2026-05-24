package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Security Scheme Constructors ---

func TestHTTPBearer(t *testing.T) {
	scheme := HTTPBearer()

	assert.Equal(t, "http", scheme.Type)
	assert.Equal(t, "bearer", scheme.Scheme)
	assert.Equal(t, "", scheme.BearerFormat)
}

func TestHTTPBearerJWT(t *testing.T) {
	scheme := HTTPBearerJWT().WithDescription("JWT authentication")

	assert.Equal(t, "http", scheme.Type)
	assert.Equal(t, "bearer", scheme.Scheme)
	assert.Equal(t, "JWT", scheme.BearerFormat)
	assert.Equal(t, "JWT authentication", scheme.Description)
}

func TestHTTPBasic(t *testing.T) {
	scheme := HTTPBasic().WithDescription("Basic HTTP auth")

	assert.Equal(t, "http", scheme.Type)
	assert.Equal(t, "basic", scheme.Scheme)
	assert.Equal(t, "Basic HTTP auth", scheme.Description)
}

func TestAPIKeyHeader(t *testing.T) {
	scheme := APIKeyHeader("X-API-Key").WithDescription("API key in header")

	assert.Equal(t, "apiKey", scheme.Type)
	assert.Equal(t, "header", scheme.In)
	assert.Equal(t, "X-API-Key", scheme.Name)
	assert.Equal(t, "API key in header", scheme.Description)
}

func TestAPIKeyQuery(t *testing.T) {
	scheme := APIKeyQuery("api_key").WithDescription("API key in query")

	assert.Equal(t, "apiKey", scheme.Type)
	assert.Equal(t, "query", scheme.In)
	assert.Equal(t, "api_key", scheme.Name)
	assert.Equal(t, "API key in query", scheme.Description)
}

func TestAPIKeyCookie(t *testing.T) {
	scheme := APIKeyCookie("session").WithDescription("Session cookie")

	assert.Equal(t, "apiKey", scheme.Type)
	assert.Equal(t, "cookie", scheme.In)
	assert.Equal(t, "session", scheme.Name)
	assert.Equal(t, "Session cookie", scheme.Description)
}

func TestOpenIDConnect(t *testing.T) {
	scheme := OpenIDConnect("https://example.com/.well-known/openid-configuration").
		WithDescription("OIDC auth")

	assert.Equal(t, "openIdConnect", scheme.Type)
	assert.Equal(t, "https://example.com/.well-known/openid-configuration", scheme.OpenIDConnectURL)
	assert.Equal(t, "OIDC auth", scheme.Description)
}

func TestOAuth2Implicit(t *testing.T) {
	scopes := map[string]string{
		"read":  "Read access",
		"write": "Write access",
	}
	scheme := OAuth2Implicit("https://example.com/auth", scopes).
		WithDescription("OAuth2 implicit flow")

	assert.Equal(t, "oauth2", scheme.Type)
	assert.Equal(t, "OAuth2 implicit flow", scheme.Description)
	require.NotNil(t, scheme.Flows)
	require.NotNil(t, scheme.Flows.Implicit)
	assert.Equal(t, "https://example.com/auth", scheme.Flows.Implicit.AuthorizationURL)
	assert.Equal(t, scopes, scheme.Flows.Implicit.Scopes)
}

func TestOAuth2Password(t *testing.T) {
	scopes := map[string]string{
		"read": "Read access",
	}
	scheme := OAuth2Password("https://example.com/token", scopes).
		WithDescription("OAuth2 password flow")

	assert.Equal(t, "oauth2", scheme.Type)
	require.NotNil(t, scheme.Flows)
	require.NotNil(t, scheme.Flows.Password)
	assert.Equal(t, "https://example.com/token", scheme.Flows.Password.TokenURL)
	assert.Equal(t, scopes, scheme.Flows.Password.Scopes)
}

func TestOAuth2ClientCredentials(t *testing.T) {
	scopes := map[string]string{
		"admin": "Admin access",
	}
	scheme := OAuth2ClientCredentials("https://example.com/token", scopes).
		WithDescription("OAuth2 client credentials")

	assert.Equal(t, "oauth2", scheme.Type)
	require.NotNil(t, scheme.Flows)
	require.NotNil(t, scheme.Flows.ClientCredentials)
	assert.Equal(t, "https://example.com/token", scheme.Flows.ClientCredentials.TokenURL)
}

func TestOAuth2AuthorizationCode(t *testing.T) {
	scopes := map[string]string{
		"profile": "Profile access",
	}
	scheme := OAuth2AuthorizationCode(
		"https://example.com/auth",
		"https://example.com/token",
		scopes,
	).WithDescription("OAuth2 authorization code flow")

	assert.Equal(t, "oauth2", scheme.Type)
	require.NotNil(t, scheme.Flows)
	require.NotNil(t, scheme.Flows.AuthorizationCode)
	assert.Equal(t, "https://example.com/auth", scheme.Flows.AuthorizationCode.AuthorizationURL)
	assert.Equal(t, "https://example.com/token", scheme.Flows.AuthorizationCode.TokenURL)
}

// --- SecurityScheme.OpenAPI ---

func TestSecurityScheme_OpenAPI_HTTP(t *testing.T) {
	scheme := HTTPBearerJWT().WithDescription("JWT auth")

	openapi := scheme.OpenAPI()

	assert.Equal(t, "http", openapi["type"])
	assert.Equal(t, "bearer", openapi["scheme"])
	assert.Equal(t, "JWT", openapi["bearerFormat"])
	assert.Equal(t, "JWT auth", openapi["description"])
}

func TestSecurityScheme_OpenAPI_APIKey(t *testing.T) {
	scheme := APIKeyHeader("X-API-Key").WithDescription("API key")

	openapi := scheme.OpenAPI()

	assert.Equal(t, "apiKey", openapi["type"])
	assert.Equal(t, "header", openapi["in"])
	assert.Equal(t, "X-API-Key", openapi["name"])
}

func TestSecurityScheme_OpenAPI_OpenIDConnect(t *testing.T) {
	scheme := OpenIDConnect("https://example.com/.well-known/openid").
		WithDescription("OIDC")

	openapi := scheme.OpenAPI()

	assert.Equal(t, "openIdConnect", openapi["type"])
	assert.Equal(t, "https://example.com/.well-known/openid", openapi["openIdConnectUrl"])
}

func TestSecurityScheme_OpenAPI_OAuth2(t *testing.T) {
	scheme := &SecurityScheme{
		Type:        "oauth2",
		Description: "OAuth2 all flows",
		Flows: &OAuthFlows{
			Implicit: &OAuthFlow{
				AuthorizationURL: "https://example.com/auth",
				Scopes:           map[string]string{"read": "Read"},
			},
			Password: &OAuthFlow{
				TokenURL: "https://example.com/token",
				Scopes:   map[string]string{"write": "Write"},
			},
			ClientCredentials: &OAuthFlow{
				TokenURL: "https://example.com/token",
				Scopes:   map[string]string{"admin": "Admin"},
			},
			AuthorizationCode: &OAuthFlow{
				AuthorizationURL: "https://example.com/auth",
				TokenURL:         "https://example.com/token",
				RefreshURL:       "https://example.com/refresh",
				Scopes:           map[string]string{"all": "All access"},
			},
		},
	}

	openapi := scheme.OpenAPI()

	assert.Equal(t, "oauth2", openapi["type"])

	flows, ok := openapi["flows"].(map[string]any)
	require.True(t, ok)

	implicit, ok := flows["implicit"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/auth", implicit["authorizationUrl"])

	password, ok := flows["password"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/token", password["tokenUrl"])

	clientCreds, ok := flows["clientCredentials"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/token", clientCreds["tokenUrl"])

	authCode, ok := flows["authorizationCode"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "https://example.com/auth", authCode["authorizationUrl"])
	assert.Equal(t, "https://example.com/token", authCode["tokenUrl"])
	assert.Equal(t, "https://example.com/refresh", authCode["refreshUrl"])
}

func TestSecurityScheme_OpenAPI_Nil(t *testing.T) {
	var scheme *SecurityScheme
	assert.Nil(t, scheme.OpenAPI())
}

// --- OAuthFlow.OpenAPI ---

func TestOAuthFlow_OpenAPI(t *testing.T) {
	flow := OAuthFlow{
		AuthorizationURL: "https://example.com/auth",
		TokenURL:         "https://example.com/token",
		RefreshURL:       "https://example.com/refresh",
		Scopes: map[string]string{
			"read":  "Read access",
			"write": "Write access",
		},
	}

	openapi := flow.OpenAPI()

	assert.Equal(t, "https://example.com/auth", openapi["authorizationUrl"])
	assert.Equal(t, "https://example.com/token", openapi["tokenUrl"])
	assert.Equal(t, "https://example.com/refresh", openapi["refreshUrl"])

	scopes, ok := openapi["scopes"].(map[string]string)
	require.True(t, ok)
	assert.Equal(t, "Read access", scopes["read"])
	assert.Equal(t, "Write access", scopes["write"])
}

func TestOAuthFlow_OpenAPI_EmptyScopes(t *testing.T) {
	flow := OAuthFlow{
		TokenURL: "https://example.com/token",
	}

	openapi := flow.OpenAPI()

	scopes, ok := openapi["scopes"].(map[string]string)
	require.True(t, ok)
	assert.Empty(t, scopes)
}

// --- Security (requirement) ---

func TestNewSecurity(t *testing.T) {
	sec := NewSecurity("jwt")

	reqs := sec.Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "jwt", reqs[0].Scheme)
	assert.Empty(t, reqs[0].Scopes)
}

func TestNewSecurity_WithScopes(t *testing.T) {
	sec := NewSecurity("oauth2", "read", "write")

	reqs := sec.Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "oauth2", reqs[0].Scheme)
	assert.Equal(t, []string{"read", "write"}, reqs[0].Scopes)
}

func TestSecurity_And(t *testing.T) {
	sec := NewSecurity("jwt").And("api_key")

	reqs := sec.Requirements()
	require.Len(t, reqs, 2)
	assert.Equal(t, "jwt", reqs[0].Scheme)
	assert.Equal(t, "api_key", reqs[1].Scheme)
}

func TestSecurity_And_WithScopes(t *testing.T) {
	sec := NewSecurity("oauth2", "read").And("jwt")

	reqs := sec.Requirements()
	require.Len(t, reqs, 2)
	assert.Equal(t, "oauth2", reqs[0].Scheme)
	assert.Equal(t, []string{"read"}, reqs[0].Scopes)
	assert.Equal(t, "jwt", reqs[1].Scheme)
	assert.Empty(t, reqs[1].Scopes)
}

func TestSecurity_IsEmpty(t *testing.T) {
	empty := Security{}
	assert.True(t, empty.IsEmpty())

	notEmpty := NewSecurity("jwt")
	assert.False(t, notEmpty.IsEmpty())
}

func TestSecurity_ToMap(t *testing.T) {
	sec := NewSecurity("oauth2", "read").And("jwt")

	m := sec.ToMap()
	assert.Equal(t, []string{"read"}, m["oauth2"])
	assert.Empty(t, m["jwt"])
}

// --- OAuthFlows.OpenAPI ---

func TestOAuthFlows_OpenAPI(t *testing.T) {
	flows := &OAuthFlows{
		Implicit: &OAuthFlow{
			AuthorizationURL: "https://example.com/auth",
			Scopes:           map[string]string{},
		},
	}

	openapi := flows.OpenAPI()

	_, hasImplicit := openapi["implicit"]
	assert.True(t, hasImplicit)
}

func TestOAuthFlows_OpenAPI_AllFlows(t *testing.T) {
	flows := &OAuthFlows{
		Implicit:          &OAuthFlow{Scopes: map[string]string{}},
		Password:          &OAuthFlow{Scopes: map[string]string{}},
		ClientCredentials: &OAuthFlow{Scopes: map[string]string{}},
		AuthorizationCode: &OAuthFlow{Scopes: map[string]string{}},
	}

	openapi := flows.OpenAPI()

	assert.Contains(t, openapi, "implicit")
	assert.Contains(t, openapi, "password")
	assert.Contains(t, openapi, "clientCredentials")
	assert.Contains(t, openapi, "authorizationCode")
}

// --- Validator Interface ---

type mockValidator struct {
	claims any
	err    error
}

func (m *mockValidator) Validate(ctx context.Context, r *http.Request) (any, error) {
	return m.claims, m.err
}

func TestValidatorFunc(t *testing.T) {
	called := false
	expectedClaims := map[string]string{"user": "test"}

	vf := ValidatorFunc(func(ctx context.Context, r *http.Request) (any, error) {
		called = true
		return expectedClaims, nil
	})

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	claims, err := vf.Validate(context.Background(), req)

	assert.True(t, called)
	assert.NoError(t, err)
	assert.Equal(t, expectedClaims, claims)
}

// --- Security Registry ---

func TestSecurityRegistry_MustRegister(t *testing.T) {
	reg := NewSecurityRegistry()
	scheme := HTTPBearerJWT()
	validator := &mockValidator{claims: "test"}

	reg.MustRegister("jwt", scheme, validator)

	assert.Equal(t, scheme, reg.GetScheme("jwt"))
	assert.Equal(t, validator, reg.GetValidator("jwt"))
}

func TestSecurityRegistry_MustRegister_PanicOnDuplicate(t *testing.T) {
	reg := NewSecurityRegistry()
	scheme := HTTPBearerJWT()
	validator := &mockValidator{}

	reg.MustRegister("jwt", scheme, validator)

	assert.Panics(t, func() {
		reg.MustRegister("jwt", scheme, validator)
	})
}

func TestSecurityRegistry_MustRegister_PanicOnNilValidator(t *testing.T) {
	reg := NewSecurityRegistry()
	scheme := HTTPBearerJWT()

	assert.Panics(t, func() {
		reg.MustRegister("jwt", scheme, nil)
	})
}

func TestSecurityRegistry_MustRegister_PanicOnNilScheme(t *testing.T) {
	reg := NewSecurityRegistry()
	validator := &mockValidator{}

	assert.Panics(t, func() {
		reg.MustRegister("jwt", nil, validator)
	})
}

func TestSecurityRegistry_Register(t *testing.T) {
	reg := NewSecurityRegistry()
	scheme := HTTPBearerJWT()
	validator := &mockValidator{}

	err := reg.Register("jwt", scheme, validator)
	assert.NoError(t, err)

	err = reg.Register("jwt", scheme, validator)
	assert.Error(t, err)
}

func TestSecurityRegistry_Schemes(t *testing.T) {
	reg := NewSecurityRegistry()
	scheme1 := HTTPBearerJWT()
	scheme2 := APIKeyHeader("X-API-Key")

	reg.MustRegister("jwt", scheme1, &mockValidator{})
	reg.MustRegister("apikey", scheme2, &mockValidator{})

	schemes := reg.Schemes()

	assert.Len(t, schemes, 2)
	assert.Equal(t, scheme1, schemes["jwt"])
	assert.Equal(t, scheme2, schemes["apikey"])
}

func TestSecurityRegistry_GetScheme_NotFound(t *testing.T) {
	reg := NewSecurityRegistry()
	assert.Nil(t, reg.GetScheme("nonexistent"))
}

func TestSecurityRegistry_GetValidator_NotFound(t *testing.T) {
	reg := NewSecurityRegistry()
	assert.Nil(t, reg.GetValidator("nonexistent"))
}

func TestSecurityRegistry_ValidateSecurityRequirements(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{})
	reg.MustRegister("apikey", APIKeyHeader("X-Key"), &mockValidator{})

	// All schemes registered
	err := reg.ValidateSecurityRequirements([]Security{
		NewSecurity("jwt"),
		NewSecurity("apikey"),
	})
	assert.NoError(t, err)

	// Missing scheme
	err = reg.ValidateSecurityRequirements([]Security{
		NewSecurity("jwt"),
		NewSecurity("missing"),
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing")
}

// --- Authentication Middleware ---

func TestMiddleware_NoSecurityRequirements(t *testing.T) {
	reg := NewSecurityRegistry()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware(nil, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestMiddleware_EmptySecurityAllowsAccess(t *testing.T) {
	reg := NewSecurityRegistry()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Empty Security{} means explicitly optional auth
	middleware := reg.Middleware([]Security{{}}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestMiddleware_SuccessfulAuth(t *testing.T) {
	reg := NewSecurityRegistry()
	expectedClaims := map[string]string{"userID": "123"}
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{claims: expectedClaims})

	var capturedAuthResult *AuthResult

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthResult = GetAuthResult(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("jwt")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedAuthResult)
	require.Len(t, capturedAuthResult.Schemes, 1)
	assert.Equal(t, "jwt", capturedAuthResult.Schemes[0])
	assert.Equal(t, expectedClaims, capturedAuthResult.GetClaims())
	assert.Equal(t, expectedClaims, capturedAuthResult.Claims["jwt"])
}

func TestMiddleware_FailedAuth_DefaultHandler(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("jwt")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_FailedAuth_CustomHandler(t *testing.T) {
	reg := NewSecurityRegistry()
	customErr := errors.New("invalid token")
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: customErr})

	var capturedErr error

	errorHandler := func(w http.ResponseWriter, r *http.Request, err error) {
		capturedErr = err
		w.WriteHeader(http.StatusForbidden)
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("jwt")}, errorHandler)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Equal(t, customErr, capturedErr)
}

func TestMiddleware_ORRelationship_FirstSucceeds(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{claims: "jwt-claims"})
	reg.MustRegister("apikey", APIKeyHeader("X-Key"), &mockValidator{claims: "apikey-claims"})

	var capturedAuthResult *AuthResult

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthResult = GetAuthResult(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// OR relationship: jwt OR apikey
	middleware := reg.Middleware([]Security{
		NewSecurity("jwt"),
		NewSecurity("apikey"),
	}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedAuthResult)
	require.Len(t, capturedAuthResult.Schemes, 1)
	assert.Equal(t, "jwt", capturedAuthResult.Schemes[0]) // First one succeeds
}

func TestMiddleware_ORRelationship_FallbackToSecond(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: ErrSkipToNextAuth})
	reg.MustRegister("apikey", APIKeyHeader("X-Key"), &mockValidator{claims: "apikey-claims"})

	var capturedAuthResult *AuthResult

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthResult = GetAuthResult(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{
		NewSecurity("jwt"),
		NewSecurity("apikey"),
	}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedAuthResult)
	require.Len(t, capturedAuthResult.Schemes, 1)
	assert.Equal(t, "apikey", capturedAuthResult.Schemes[0]) // Falls back to second
}

func TestMiddleware_ORRelationship_AllFail(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: ErrSkipToNextAuth})
	reg.MustRegister("apikey", APIKeyHeader("X-Key"), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{
		NewSecurity("jwt"),
		NewSecurity("apikey"),
	}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_HardError_StopsTrying(t *testing.T) {
	reg := NewSecurityRegistry()
	hardErr := errors.New("token expired") // Not ErrSkipToNextAuth
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: hardErr})
	reg.MustRegister("apikey", APIKeyHeader("X-Key"), &mockValidator{claims: "should-not-reach"})

	var capturedErr error

	errorHandler := func(w http.ResponseWriter, r *http.Request, err error) {
		capturedErr = err
		w.WriteHeader(http.StatusUnauthorized)
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{
		NewSecurity("jwt"),
		NewSecurity("apikey"),
	}, errorHandler)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, hardErr, capturedErr) // Hard error, didn't try apikey
}

func TestMiddleware_ANDRelationship(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{claims: "jwt-claims"})
	reg.MustRegister("mfa", APIKeyHeader("X-MFA"), &mockValidator{claims: "mfa-claims"})

	var capturedAuthResult *AuthResult

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedAuthResult = GetAuthResult(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	// AND relationship: jwt AND mfa (both must pass)
	middleware := reg.Middleware([]Security{
		NewSecurity("jwt").And("mfa"),
	}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	require.NotNil(t, capturedAuthResult)
	// Both schemes should be in the list (in order)
	require.Len(t, capturedAuthResult.Schemes, 2)
	assert.Equal(t, "jwt", capturedAuthResult.Schemes[0])
	assert.Equal(t, "mfa", capturedAuthResult.Schemes[1])
	// Both claims should be accumulated
	assert.Equal(t, "jwt-claims", capturedAuthResult.Claims["jwt"])
	assert.Equal(t, "mfa-claims", capturedAuthResult.Claims["mfa"])
	// GetClaims returns first scheme's claims
	assert.Equal(t, "jwt-claims", capturedAuthResult.GetClaims())
	// GetClaimsByScheme returns specific scheme's claims
	assert.Equal(t, "mfa-claims", capturedAuthResult.GetClaimsByScheme("mfa"))
}

func TestMiddleware_ANDRelationship_OneFails(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{claims: "jwt-claims"})
	reg.MustRegister("mfa", APIKeyHeader("X-MFA"), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{
		NewSecurity("jwt").And("mfa"),
	}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestMiddleware_UnregisteredScheme(t *testing.T) {
	reg := NewSecurityRegistry()

	var capturedErr error

	errorHandler := func(w http.ResponseWriter, r *http.Request, err error) {
		capturedErr = err
		w.WriteHeader(http.StatusInternalServerError)
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{
		NewSecurity("unregistered"),
	}, errorHandler)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusInternalServerError, rec.Code)
	assert.Contains(t, capturedErr.Error(), "unregistered")
}

// --- GetAuthResult ---

func TestGetAuthResult_NotSet(t *testing.T) {
	ctx := context.Background()
	assert.Nil(t, GetAuthResult(ctx))
}

func TestGetAuthResult_Set(t *testing.T) {
	ctx := context.Background()
	result := &AuthResult{
		Schemes: []string{"jwt"},
		Claims:  map[string]any{"jwt": "test"},
	}
	ctx = setAuthResult(ctx, result)

	retrieved := GetAuthResult(ctx)
	require.NotNil(t, retrieved)
	require.Len(t, retrieved.Schemes, 1)
	assert.Equal(t, "jwt", retrieved.Schemes[0])
	assert.Equal(t, "test", retrieved.GetClaims())
}

func TestAuthResult_GetClaims_Nil(t *testing.T) {
	var result *AuthResult
	assert.Nil(t, result.GetClaims())

	result = &AuthResult{}
	assert.Nil(t, result.GetClaims())
}

func TestAuthResult_GetClaimsByScheme_Nil(t *testing.T) {
	var result *AuthResult
	assert.Nil(t, result.GetClaimsByScheme("jwt"))

	result = &AuthResult{}
	assert.Nil(t, result.GetClaimsByScheme("jwt"))
}

// --- WWW-Authenticate Header Tests ---

func TestMiddleware_WWWAuthenticate_BearerScheme(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("jwt")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, "Bearer", rec.Header().Get("WWW-Authenticate"))
}

func TestMiddleware_WWWAuthenticate_BasicScheme(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("basic", HTTPBasic(), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("basic")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, "Basic", rec.Header().Get("WWW-Authenticate"))
}

func TestMiddleware_WWWAuthenticate_ApiKeyOnly_NoHeader(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("apikey", APIKeyHeader("X-API-Key"), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := reg.Middleware([]Security{NewSecurity("apikey")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	// apiKey-only routes should NOT have WWW-Authenticate (no standard challenge)
	assert.Empty(t, rec.Header().Get("WWW-Authenticate"))
}

func TestMiddleware_WWWAuthenticate_MultipleSchemes(t *testing.T) {
	reg := NewSecurityRegistry()
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{err: ErrSkipToNextAuth})
	reg.MustRegister("basic", HTTPBasic(), &mockValidator{err: ErrSkipToNextAuth})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// OR relationship - either jwt or basic
	middleware := reg.Middleware([]Security{NewSecurity("jwt"), NewSecurity("basic")}, nil)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	wwwAuth := rec.Header().Get("WWW-Authenticate")
	assert.Contains(t, wwwAuth, "Bearer")
	assert.Contains(t, wwwAuth, "Basic")
}

func TestSecurityRegistry_ConcurrentAccess(t *testing.T) {
	reg := NewSecurityRegistry()

	// Pre-register one scheme
	reg.MustRegister("jwt", HTTPBearerJWT(), &mockValidator{claims: map[string]string{"ok": "true"}})

	var wg sync.WaitGroup
	const goroutines = 10
	const iterations = 100

	// Concurrent reads via middleware
	for range goroutines {
		wg.Go(func() {
			for range iterations {
				middleware := reg.Middleware([]Security{NewSecurity("jwt")}, nil)
				handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(http.StatusOK)
				}))

				req := httptest.NewRequestWithContext(context.Background(), "GET", "/", http.NoBody)
				rec := httptest.NewRecorder()
				handler.ServeHTTP(rec, req)
			}
		})
	}

	wg.Wait()
	// If we get here without data race, the mutex is working
}
