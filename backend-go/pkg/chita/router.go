package chita

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RouterConfig configures the router
type RouterConfig struct {
	// App for typed handler wrapping and error handling
	App *App

	// OpenAPI spec configuration
	Spec *OpenAPIConfig
}

// Router wraps chi.Router with typed handlers and OpenAPI generation
type Router struct {
	chi chi.Router
	app *App

	// OpenAPI
	specConfig *OpenAPIConfig
	endpoints  []Endpoint

	// Inherited defaults
	basePath         string
	defaultSecurity  []Security
	defaultTags      []string
	defaultResponses []TypedResponse

	// Reference to root router for endpoint collection
	root *Router
}

// NewRouter creates a new Router with typed handler support and OpenAPI generation
func NewRouter(config RouterConfig) *Router {
	if config.App == nil {
		config.App = NewApp(AppConfig{})
	}
	r := &Router{
		chi:        chi.NewRouter(),
		app:        config.App,
		specConfig: config.Spec,
	}
	r.root = r // root points to itself
	return r
}

// =============================================================================
// HTTP Methods — New Builder API
// =============================================================================

// GET registers a GET endpoint with a typed handler builder
func (r *Router) GET(pattern string, spec EndpointSpec) {
	r.registerEndpoint(http.MethodGet, pattern, spec)
}

// POST registers a POST endpoint with a typed handler builder
func (r *Router) POST(pattern string, spec EndpointSpec) {
	r.registerEndpoint(http.MethodPost, pattern, spec)
}

// PUT registers a PUT endpoint with a typed handler builder
func (r *Router) PUT(pattern string, spec EndpointSpec) {
	r.registerEndpoint(http.MethodPut, pattern, spec)
}

// PATCH registers a PATCH endpoint with a typed handler builder
func (r *Router) PATCH(pattern string, spec EndpointSpec) {
	r.registerEndpoint(http.MethodPatch, pattern, spec)
}

// DELETE registers a DELETE endpoint with a typed handler builder
func (r *Router) DELETE(pattern string, spec EndpointSpec) {
	r.registerEndpoint(http.MethodDelete, pattern, spec)
}

// registerEndpoint builds and registers an endpoint from a spec
func (r *Router) registerEndpoint(method, pattern string, spec EndpointSpec) {
	// Collect default responses from router chain + app
	defaults := r.collectDefaultResponses()

	// Build the endpoint
	handler, ep := spec.build(r.basePath, defaults, r.defaultTags, r.defaultSecurity)

	// Set method and pattern
	ep.Method = method
	ep.Pattern = r.basePath + pattern

	// Collect endpoint at root
	r.root.endpoints = append(r.root.endpoints, ep)

	// Register with chi
	r.chi.Method(method, pattern, handler)
}

// collectDefaultResponses gathers defaults from app and router chain
func (r *Router) collectDefaultResponses() []TypedResponse {
	var defaults []TypedResponse

	// App defaults first (lowest precedence)
	if r.app != nil {
		defaults = append(defaults, r.app.DefaultResponses()...)
	}

	// Router defaults (higher precedence - will override app defaults by status code)
	defaults = append(defaults, r.defaultResponses...)

	return defaults
}

// =============================================================================
// Chi Router Methods
// =============================================================================

// Route creates a subrouter with a path prefix
func (r *Router) Route(pattern string, fn func(r *Router)) {
	sub := &Router{
		chi:              chi.NewRouter(),
		app:              r.app,
		specConfig:       r.specConfig,
		basePath:         r.basePath + pattern,
		defaultSecurity:  r.defaultSecurity,
		defaultTags:      r.defaultTags,
		defaultResponses: r.defaultResponses, // Inherit default responses
		root:             r.root,
	}

	fn(sub)

	r.chi.Mount(pattern, sub.chi)
}

// Group creates a route group with shared middleware but no path prefix
func (r *Router) Group(fn func(r *Router)) {
	sub := &Router{
		chi:              r.chi,
		app:              r.app,
		specConfig:       r.specConfig,
		basePath:         r.basePath,
		defaultSecurity:  r.defaultSecurity,
		defaultTags:      r.defaultTags,
		defaultResponses: r.defaultResponses,
		root:             r.root,
	}

	fn(sub)
}

// Mount attaches another http.Handler at a given pattern
func (r *Router) Mount(pattern string, handler http.Handler) {
	// If mounting another Router, collect its endpoints
	if subRouter, ok := handler.(*Router); ok {
		for i := range subRouter.endpoints {
			ep := subRouter.endpoints[i]
			ep.Pattern = pattern + ep.Pattern
			r.root.endpoints = append(r.root.endpoints, ep)
		}
	}
	r.chi.Mount(pattern, handler)
}

// Use appends middleware to the router
func (r *Router) Use(middlewares ...func(http.Handler) http.Handler) {
	r.chi.Use(middlewares...)
}

// With returns a new router context with the middleware applied
func (r *Router) With(middlewares ...func(http.Handler) http.Handler) *Router {
	return &Router{
		chi:              r.chi.With(middlewares...),
		app:              r.app,
		specConfig:       r.specConfig,
		basePath:         r.basePath,
		defaultSecurity:  r.defaultSecurity,
		defaultTags:      r.defaultTags,
		defaultResponses: r.defaultResponses,
		root:             r.root,
	}
}

// =============================================================================
// Default Configuration
// =============================================================================

// WithSecurity sets default security for all endpoints in this router/group.
// If the App has a SecurityRegistry configured, this also installs the auth middleware.
// This combines OpenAPI documentation and runtime enforcement in one call.
func (r *Router) WithSecurity(security ...Security) *Router {
	r.defaultSecurity = security

	// Auto-install middleware if registry is available
	if r.app != nil && r.app.securityRegistry != nil {
		// Use the app's error handler for auth failures
		authErrHandler := func(w http.ResponseWriter, req *http.Request, err error) {
			writeErrorResponse(w, r.app.errorHandler(req.Context(), err))
		}
		r.chi.Use(r.app.securityRegistry.Middleware(security, authErrHandler))
	}

	return r
}

// WithTags sets default tags for all endpoints in this router/group
func (r *Router) WithTags(tags ...string) *Router {
	r.defaultTags = tags
	return r
}

// WithDefaultResponses sets default error responses for all endpoints in this router/group.
// These are merged with app-level defaults. Router defaults override app defaults by status code.
func (r *Router) WithDefaultResponses(responses ...TypedResponse) *Router {
	r.defaultResponses = append(r.defaultResponses, responses...)
	return r
}

// =============================================================================
// OpenAPI
// =============================================================================

// Spec generates the OpenAPI spec from registered endpoints
func (r *Router) Spec() *OpenAPISpec {
	if r.specConfig == nil {
		r.specConfig = &OpenAPIConfig{
			Info: OpenAPIInfo{
				Title:   "API",
				Version: "1.0.0",
			},
		}
	}
	spec := NewOpenAPISpec(r.specConfig)
	spec.AddEndpoints(r.root.endpoints)
	return spec
}

// ServeSpec registers a handler that serves the OpenAPI spec as JSON
func (r *Router) ServeSpec(pattern string) {
	spec := r.Spec()
	r.chi.Get(pattern, func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(spec.Generate())
	})
}

// Endpoints returns all registered endpoints
func (r *Router) Endpoints() []Endpoint {
	return r.root.endpoints
}

// =============================================================================
// http.Handler
// =============================================================================

// ServeHTTP implements http.Handler
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.chi.ServeHTTP(w, req)
}

// Chi returns the underlying chi.Router (for advanced use cases)
func (r *Router) Chi() chi.Router {
	return r.chi
}
