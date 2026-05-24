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

// --- Basic Route Registration ---

func TestRouter_Get(t *testing.T) {
	r := NewRouter()

	called := false
	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.True(t, called)
	assert.Equal(t, http.StatusOK, rec.Code)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodGet, endpoints[0].Method)
	assert.Equal(t, "/test", endpoints[0].Pattern)
}

func TestRouter_Post(t *testing.T) {
	r := NewRouter()

	r.Post("/create", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/create", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusCreated, rec.Code)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPost, endpoints[0].Method)
}

func TestRouter_Put(t *testing.T) {
	r := NewRouter()

	r.Put("/update", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPut, endpoints[0].Method)
}

func TestRouter_Patch(t *testing.T) {
	r := NewRouter()

	r.Patch("/partial", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodPatch, endpoints[0].Method)
}

func TestRouter_Delete(t *testing.T) {
	r := NewRouter()

	r.Delete("/remove", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, http.MethodDelete, endpoints[0].Method)
}

// --- Route with Options ---

func TestRouter_WithOptions(t *testing.T) {
	r := NewRouter()

	r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	},
		WithSummary("Get user by ID"),
		WithDescription("Retrieves a user by their unique ID"),
		WithOperationID("getUser"),
		WithTags("Users"),
		WithSecurityRequirements(NewSecurity("jwt")),
		WithDeprecated(),
	)

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

func TestRouter_WithNoAuth(t *testing.T) {
	r := NewRouter()

	r.Get("/public", func(w http.ResponseWriter, r *http.Request) {},
		WithNoAuth(),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	require.Len(t, endpoints[0].Security, 1)
	assert.True(t, endpoints[0].Security[0].IsEmpty())
}

// --- Route Groups ---

func TestRouter_Route(t *testing.T) {
	r := NewRouter()

	r.Route("/api/v1", func(sub *Router) {
		sub.Get("/users", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
		sub.Post("/users", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
		})
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
	r := NewRouter()

	r.Route("/api", func(api *Router) {
		api.Route("/v1", func(v1 *Router) {
			v1.Route("/users", func(users *Router) {
				users.Get("/", func(w http.ResponseWriter, r *http.Request) {
					_, _ = w.Write([]byte("list users"))
				})
				users.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
					_, _ = w.Write([]byte("get user"))
				})
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
	assert.Equal(t, "list users", string(body))
}

// --- Default Security and Tags ---

func TestRouter_WithSecurity(t *testing.T) {
	r := NewRouter()

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))

		api.Get("/protected", func(w http.ResponseWriter, r *http.Request) {})
		api.Post("/protected", func(w http.ResponseWriter, r *http.Request) {})
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
	r := NewRouter()

	r.Route("/api/users", func(users *Router) {
		users.WithTags("Users", "Admin")

		users.Get("/", func(w http.ResponseWriter, r *http.Request) {})
		users.Post("/", func(w http.ResponseWriter, r *http.Request) {})
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	for _, ep := range endpoints {
		assert.Equal(t, []string{"Users", "Admin"}, ep.Tags)
	}
}

func TestRouter_InheritedDefaults(t *testing.T) {
	r := NewRouter()

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))
		api.WithTags("API")

		api.Route("/v1", func(v1 *Router) {
			// Should inherit security and tags from parent
			v1.Get("/test", func(w http.ResponseWriter, r *http.Request) {})
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

func TestRouter_OverrideDefaults(t *testing.T) {
	r := NewRouter()

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))
		api.WithTags("API")

		api.Route("/public", func(pub *Router) {
			pub.WithSecurity() // Clear security

			pub.Get("/health", func(w http.ResponseWriter, r *http.Request) {})
		})

		api.Get("/protected", func(w http.ResponseWriter, r *http.Request) {})
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	// Find public endpoint
	var publicEp, protectedEp *Endpoint
	for i := range endpoints {
		if endpoints[i].Pattern == "/api/public/health" {
			publicEp = &endpoints[i]
		} else {
			protectedEp = &endpoints[i]
		}
	}

	require.NotNil(t, publicEp)
	require.NotNil(t, protectedEp)

	assert.Empty(t, publicEp.Security)
	require.Len(t, protectedEp.Security, 1)
}

func TestRouter_EndpointOverridesGroupDefaults(t *testing.T) {
	r := NewRouter()

	r.Route("/api", func(api *Router) {
		api.WithSecurity(NewSecurity("jwt"))
		api.WithTags("API")

		// This endpoint overrides both security and tags
		api.Get("/special", func(w http.ResponseWriter, r *http.Request) {},
			WithSecurityRequirements(NewSecurity("api_key")),
			WithTags("Special"),
		)
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

// --- Group without path prefix ---

func TestRouter_Group(t *testing.T) {
	r := NewRouter()

	r.Group(func(g *Router) {
		g.WithSecurity(NewSecurity("jwt"))

		g.Get("/a", func(w http.ResponseWriter, r *http.Request) {})
		g.Get("/b", func(w http.ResponseWriter, r *http.Request) {})
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 2)

	for _, ep := range endpoints {
		require.Len(t, ep.Security, 1)
	}
	assert.Equal(t, "/a", endpoints[0].Pattern)
	assert.Equal(t, "/b", endpoints[1].Pattern)
}

// --- Handle with Endpoint struct ---

func TestRouter_Handle(t *testing.T) {
	r := NewRouter()

	r.Handle(Endpoint{
		Method:  http.MethodGet,
		Pattern: "/custom",
		Handler: func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		},
		Summary:     "Custom endpoint",
		Description: "A custom endpoint",
		Tags:        []string{"Custom"},
		Security:    []Security{NewSecurity("bearer")},
	})

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	assert.Equal(t, http.MethodGet, ep.Method)
	assert.Equal(t, "/custom", ep.Pattern)
	assert.Equal(t, "Custom endpoint", ep.Summary)
	assert.Equal(t, "A custom endpoint", ep.Description)
	assert.Equal(t, []string{"Custom"}, ep.Tags)
}

// --- Middleware ---

func TestRouter_Use(t *testing.T) {
	r := NewRouter()

	middlewareCalled := false
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			middlewareCalled = true
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	assert.True(t, middlewareCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestRouter_With(t *testing.T) {
	r := NewRouter()

	middlewareCalled := false
	withRouter := r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			middlewareCalled = true
			next.ServeHTTP(w, r)
		})
	})

	// Original router
	r.Get("/original", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Router with middleware
	withRouter.Get("/with-middleware", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

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

// --- Mount ---

func TestRouter_Mount(t *testing.T) {
	r := NewRouter()

	sub := NewRouter()
	sub.Get("/users", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("users"))
	})

	r.Mount("/api/v1", sub)

	// Test routing
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/api/v1/users", http.NoBody)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	assert.Equal(t, "users", string(body))

	// Check endpoints are collected with prefix
	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	assert.Equal(t, "/api/v1/users", endpoints[0].Pattern)
}

// --- Path Parameters ---

func TestRouter_PathParams(t *testing.T) {
	r := NewRouter()

	r.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		_ = r.PathValue("id")
		w.WriteHeader(http.StatusOK)
	}, WithPathParams(map[string]Schema{
		"id": String(new(string)).Required().UUID(),
	}))

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Contains(t, ep.PathParams, "id")
}

// --- Query Parameters ---

func TestRouter_QueryParams(t *testing.T) {
	r := NewRouter()

	r.Get("/search", func(w http.ResponseWriter, r *http.Request) {},
		WithQueryParams(map[string]Schema{
			"q":      String(new(string)).Required().MinLength(1),
			"limit":  Int(new(int)).Optional().Min(1).Max(100),
			"offset": Int(new(int)).Optional().Min(0),
		}),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.QueryParams, 3)
	assert.Contains(t, ep.QueryParams, "q")
	assert.Contains(t, ep.QueryParams, "limit")
	assert.Contains(t, ep.QueryParams, "offset")
}

// --- Header and Cookie Parameters ---

func TestRouter_HeaderParams(t *testing.T) {
	r := NewRouter()

	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {},
		WithHeaderParams(map[string]Schema{
			"X-Request-ID": String(new(string)).Required().UUID(),
		}),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	require.Contains(t, endpoints[0].HeaderParams, "X-Request-ID")
}

func TestRouter_CookieParams(t *testing.T) {
	r := NewRouter()

	r.Get("/test", func(w http.ResponseWriter, r *http.Request) {},
		WithCookieParams(map[string]Schema{
			"session": String(new(string)).Required(),
		}),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	require.Contains(t, endpoints[0].CookieParams, "session")
}

// --- Request and Response Schemas ---

type TestRequest struct {
	Name string
}

func (r *TestRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name": String(&r.Name).Required(),
	})
}

type TestResponse struct {
	ID   string
	Name string
}

func (r *TestResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":   String(&r.ID).Required(),
		"name": String(&r.Name).Required(),
	})
}

func TestRouter_WithRequestResponse(t *testing.T) {
	r := NewRouter()

	r.Post("/users", func(w http.ResponseWriter, r *http.Request) {},
		WithRequest(&TestRequest{}),
		WithResponse(&TestResponse{}),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.NotNil(t, ep.Request)
	require.NotNil(t, ep.Response)
}

func TestRouter_WithResponses(t *testing.T) {
	r := NewRouter()

	r.Post("/users", func(w http.ResponseWriter, r *http.Request) {},
		WithResponses(map[int]SchemaProvider{
			201: &TestResponse{},
			400: nil,
		}),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)
	require.Len(t, endpoints[0].Responses, 2)
}

// --- Multiple Methods Same Path ---

func TestRouter_MultipleMethods(t *testing.T) {
	r := NewRouter()

	r.Get("/resource", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("GET"))
	})
	r.Post("/resource", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("POST"))
	})
	r.Put("/resource", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("PUT"))
	})
	r.Delete("/resource", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("DELETE"))
	})

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

// --- Security with Scopes ---

func TestRouter_SecurityWithScopes(t *testing.T) {
	r := NewRouter()

	r.Get("/admin", func(w http.ResponseWriter, r *http.Request) {},
		WithSecurityRequirements(
			NewSecurity("oauth2", "read:admin", "write:admin"),
		),
	)

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
	r := NewRouter()

	r.Get("/flexible", func(w http.ResponseWriter, r *http.Request) {},
		WithSecurityRequirements(
			NewSecurity("jwt"),
			NewSecurity("api_key"),
		),
	)

	endpoints := r.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	require.Len(t, ep.Security, 2)
}

func TestRouter_Mount_PropagatesDefaults(t *testing.T) {
	parent := NewRouter()
	parent.WithSecurity(NewSecurity("jwt"))
	parent.WithTags("api", "v1")

	child := NewRouter()
	child.Handle(Endpoint{
		Method:  http.MethodGet,
		Pattern: "/users",
		Handler: func(w http.ResponseWriter, r *http.Request) {},
	})

	parent.Mount("/api", child)

	endpoints := parent.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	assert.Equal(t, "/api/users", ep.Pattern)

	// Verify defaults propagated
	require.Len(t, ep.Security, 1)
	assert.Equal(t, "jwt", ep.Security[0].Requirements()[0].Scheme)
	assert.Equal(t, []string{"api", "v1"}, ep.Tags)
}

func TestRouter_Mount_DoesNotOverrideExplicit(t *testing.T) {
	parent := NewRouter()
	parent.WithSecurity(NewSecurity("jwt"))
	parent.WithTags("parent-tag")

	child := NewRouter()
	child.Handle(Endpoint{
		Method:   http.MethodGet,
		Pattern:  "/secure",
		Handler:  func(w http.ResponseWriter, r *http.Request) {},
		Security: []Security{NewSecurity("apikey")}, // explicit
		Tags:     []string{"child-tag"},             // explicit
	})

	parent.Mount("/api", child)

	endpoints := parent.Endpoints()
	require.Len(t, endpoints, 1)

	ep := endpoints[0]
	// Explicit values should NOT be overwritten
	require.Len(t, ep.Security, 1)
	assert.Equal(t, "apikey", ep.Security[0].Requirements()[0].Scheme)
	assert.Equal(t, []string{"child-tag"}, ep.Tags)
}
