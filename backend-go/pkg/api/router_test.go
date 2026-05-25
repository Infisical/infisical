package api

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// Test types for router tests
// =============================================================================

// EmptyRequest for handlers that don't need request parsing
type EmptyRequest struct{}

func (r *EmptyRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{})
}

// TestOKResponse is a simple 200 response
type TestOKResponse struct {
	Message string `json:"message"`
}

func (r *TestOKResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"message": String(&r.Message).Optional(),
	})
}

func (*TestOKResponse) Status() int { return http.StatusOK }

// TestCreatedResponse is a 201 response
type TestCreatedResponse struct {
	ID string `json:"id"`
}

func (r *TestCreatedResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id": String(&r.ID).Optional(),
	})
}

func (*TestCreatedResponse) Status() int { return http.StatusCreated }

// TestNoContent is a 204 response
type TestNoContent struct{}

func (*TestNoContent) Schema() *ObjectSchema { return nil }
func (*TestNoContent) Status() int           { return http.StatusNoContent }

// =============================================================================
// Test handlers
// =============================================================================

func testOKHandler(_ context.Context, _ *EmptyRequest) (TestOKResponse, error) {
	return TestOKResponse{Message: "ok"}, nil
}

func testCreatedHandler(_ context.Context, _ *EmptyRequest) (TestCreatedResponse, error) {
	return TestCreatedResponse{ID: "123"}, nil
}

func testNoContentHandler(_ context.Context, _ *EmptyRequest) (TestNoContent, error) {
	return TestNoContent{}, nil
}

// =============================================================================
// Tests
// =============================================================================

func TestRouter_GET(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.GET("/test", Handler(app, testOKHandler))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodGet, endpoints[0].Method)
	assert.Equal(t, "/test", endpoints[0].Pattern)
}

func TestRouter_POST(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.POST("/create", Handler(app, testCreatedHandler))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/create", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPost, endpoints[0].Method)
}

func TestRouter_PUT(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.PUT("/update", Handler(app, testOKHandler))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPut, endpoints[0].Method)
}

func TestRouter_PATCH(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.PATCH("/partial", Handler(app, testOKHandler))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPatch, endpoints[0].Method)
}

func TestRouter_DELETE(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.DELETE("/remove", Handler(app, testNoContentHandler))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/remove", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodDelete, endpoints[0].Method)
}

func TestRouter_WithBuilderOptions(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.GET("/users/{id}", Handler(app, testOKHandler).
		Summary("Get user by ID").
		Description("Retrieves a user by their unique ID").
		OperationID("getUser").
		Tags("Users").
		Security(NewSecurity("jwt")).
		Deprecated())

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	assert.Equal(t, "Get user by ID", ep.Summary)
	assert.Equal(t, "Retrieves a user by their unique ID", ep.Description)
	assert.Equal(t, "getUser", ep.OperationID)
	assert.Equal(t, []string{"Users"}, ep.Tags)
	assert.True(t, ep.Deprecated)
	require.Len(t, ep.Security, 1)
	reqs := ep.Security[0].Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "jwt", reqs[0].Scheme)
}

func TestRouter_Route(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api/v1", func(sub *Router) {
		sub.GET("/users", Handler(app, testOKHandler))
		sub.POST("/users", Handler(app, testCreatedHandler))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)
	assert.Equal(t, "/api/v1/users", endpoints[0].Pattern)
	assert.Equal(t, "/api/v1/users", endpoints[1].Pattern)

	// Test actual routing
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/users", http.NoBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestRouter_NestedRoutes(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api", func(api *Router) {
		api.Route("/v1", func(v1 *Router) {
			v1.Route("/users", func(users *Router) {
				users.GET("/", Handler(app, testOKHandler))
				users.GET("/{id}", Handler(app, testOKHandler))
			})
		})
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)
	assert.Equal(t, "/api/v1/users/", endpoints[0].Pattern)
	assert.Equal(t, "/api/v1/users/{id}", endpoints[1].Pattern)

	// Test actual routing
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/users/", http.NoBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	assert.Contains(t, string(body), "ok")
}

func TestRouter_WithSecurity(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))

		api.GET("/protected", Handler(app, testOKHandler))
		api.POST("/protected", Handler(app, testCreatedHandler))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	for _, ep := range endpoints {
		require.Len(t, ep.Security, 1)
		reqs := ep.Security[0].Requirements()
		require.Len(t, reqs, 1)
		assert.Equal(t, "jwt", reqs[0].Scheme)
	}
}

func TestRouter_WithTags(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api/users", func(users *Router) {
		users.WithTags("Users", "Admin")

		users.GET("/", Handler(app, testOKHandler))
		users.POST("/", Handler(app, testCreatedHandler))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	for _, ep := range endpoints {
		assert.Equal(t, []string{"Users", "Admin"}, ep.Tags)
	}
}

func TestRouter_InheritedDefaults(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))
		api.WithTags("API")

		api.Route("/v1", func(v1 *Router) {
			// Should inherit security and tags from parent
			v1.GET("/test", Handler(app, testOKHandler))
		})
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.Security, 1)
	reqs := ep.Security[0].Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "jwt", reqs[0].Scheme)
	assert.Equal(t, []string{"API"}, ep.Tags)
}

func TestRouter_BuilderOverridesDefaults(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))
		api.WithTags("API")

		// This endpoint overrides both security and tags
		api.GET("/special", Handler(app, testOKHandler).
			Security(NewSecurity("api_key")).
			Tags("Special"))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.Security, 1)
	reqs := ep.Security[0].Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "api_key", reqs[0].Scheme)
	assert.Equal(t, []string{"Special"}, ep.Tags)
}

func TestRouter_Group(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.Group(func(g *Router) {
		g.WithSecurity(NewSecurity("jwt"))

		g.GET("/a", Handler(app, testOKHandler))
		g.GET("/b", Handler(app, testOKHandler))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	for _, ep := range endpoints {
		require.Len(t, ep.Security, 1)
	}
	assert.Equal(t, "/a", endpoints[0].Pattern)
	assert.Equal(t, "/b", endpoints[1].Pattern)
}

func TestRouter_Use(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	middlewareCalled := false
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			middlewareCalled = true
			next.ServeHTTP(w, r)
		})
	})

	r.GET("/test", Handler(app, testOKHandler))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.True(t, middlewareCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestRouter_With(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	middlewareCalled := false
	withRouter := r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			middlewareCalled = true
			next.ServeHTTP(w, r)
		})
	})

	// Original router
	r.GET("/original", Handler(app, testOKHandler))

	// Router with middleware
	withRouter.GET("/with-middleware", Handler(app, testOKHandler))

	// Test original - middleware should NOT be called
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/original", http.NoBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.False(t, middlewareCalled)

	// Test with middleware
	req = httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/with-middleware", http.NoBody)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.True(t, middlewareCalled)
}

func TestRouter_Mount(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	sub := NewRouter(RouterConfig{App: app})
	sub.GET("/users", Handler(app, testOKHandler))

	r.Mount("/api/v1", sub)

	// Test routing
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/users", http.NoBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusOK, rec.Code)

	// Check endpoints are collected with prefix
	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, "/api/v1/users", endpoints[0].Pattern)
}

func TestRouter_WithDefaultResponses(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	// Create a router with default responses
	r.Route("/api", func(api *Router) {
		api.WithDefaultResponses()

		api.GET("/test", Handler(app, testOKHandler))
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	// The responses should include the handler's response
	assert.NotNil(t, endpoints[0].Responses)
}

func TestRouter_MultipleMethods(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.GET("/resource", Handler(app, testOKHandler))
	r.POST("/resource", Handler(app, testCreatedHandler))
	r.PUT("/resource", Handler(app, testOKHandler))
	r.DELETE("/resource", Handler(app, testNoContentHandler))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 4)

	methods := make(map[string]bool)
	for _, ep := range endpoints {
		methods[ep.Method] = true
	}

	assert.True(t, methods[http.MethodGet])
	assert.True(t, methods[http.MethodPost])
	assert.True(t, methods[http.MethodPut])
	assert.True(t, methods[http.MethodDelete])
}

func TestRouter_SecurityWithScopes(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.GET("/admin", Handler(app, testOKHandler).
		Security(NewSecurity("oauth2", "read:admin", "write:admin")))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.Security, 1)
	reqs := ep.Security[0].Requirements()
	require.Len(t, reqs, 1)
	assert.Equal(t, "oauth2", reqs[0].Scheme)
	assert.Equal(t, []string{"read:admin", "write:admin"}, reqs[0].Scopes)
}

func TestRouter_MultipleSecurityOptions(t *testing.T) {
	app := NewApp(AppConfig{})
	r := NewRouter(RouterConfig{App: app})

	r.GET("/flexible", Handler(app, testOKHandler).
		Security(NewSecurity("jwt"), NewSecurity("api_key")))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.Security, 2)
}
