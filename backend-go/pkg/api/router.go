package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// Router wraps chi.Router with endpoint collection for OpenAPI generation
type Router struct {
	chi.Router
	endpoints       []Endpoint
	defaultSecurity []Security
	defaultTags     []string
	basePath        string
}

// NewRouter creates a new Router
func NewRouter() *Router {
	return &Router{
		Router: chi.NewRouter(),
	}
}

// WithSecurity sets the default security requirements for all endpoints in this router
// Multiple Security entries = OR relationship (any one suffices)
func (r *Router) WithSecurity(security ...Security) *Router {
	r.defaultSecurity = security
	return r
}

// WithTags sets the default tags for all endpoints in this router
func (r *Router) WithTags(tags ...string) *Router {
	r.defaultTags = tags
	return r
}

// Route creates a subrouter with a path prefix
func (r *Router) Route(pattern string, fn func(sub *Router)) {
	sub := &Router{
		Router:          chi.NewRouter(),
		defaultSecurity: r.defaultSecurity,
		defaultTags:     r.defaultTags,
		basePath:        r.basePath + pattern,
	}

	fn(sub)

	r.endpoints = append(r.endpoints, sub.endpoints...)

	r.Router.Mount(pattern, sub.Router)
}

// Group creates a route group with shared configuration but no path prefix
func (r *Router) Group(fn func(sub *Router)) {
	sub := &Router{
		Router:          r.Router,
		defaultSecurity: r.defaultSecurity,
		defaultTags:     r.defaultTags,
		basePath:        r.basePath,
	}

	fn(sub)

	r.endpoints = append(r.endpoints, sub.endpoints...)
}

// Mount attaches a sub-router at a given pattern
func (r *Router) Mount(pattern string, handler http.Handler) {
	r.Router.Mount(pattern, handler)

	if subRouter, ok := handler.(*Router); ok {
		for i := range subRouter.endpoints {
			ep := subRouter.endpoints[i]
			ep.Pattern = pattern + ep.Pattern
			// Propagate defaults if endpoint doesn't have its own
			if len(ep.Security) == 0 && len(r.defaultSecurity) > 0 {
				ep.Security = make([]Security, len(r.defaultSecurity))
				copy(ep.Security, r.defaultSecurity)
			}
			if len(ep.Tags) == 0 && len(r.defaultTags) > 0 {
				ep.Tags = make([]string, len(r.defaultTags))
				copy(ep.Tags, r.defaultTags)
			}
			r.endpoints = append(r.endpoints, ep)
		}
	}
}

// Use appends middleware to the router
func (r *Router) Use(middlewares ...func(http.Handler) http.Handler) {
	r.Router.Use(middlewares...)
}

// With returns a new router with the given middlewares
func (r *Router) With(middlewares ...func(http.Handler) http.Handler) *Router {
	return &Router{
		Router:          r.Router.With(middlewares...),
		endpoints:       r.endpoints,
		defaultSecurity: r.defaultSecurity,
		defaultTags:     r.defaultTags,
		basePath:        r.basePath,
	}
}

// Handle registers an endpoint
func (r *Router) Handle(ep Endpoint) { //nolint:gocritic // intentional copy - we modify and store
	if len(ep.Security) == 0 && len(r.defaultSecurity) > 0 {
		ep.Security = make([]Security, len(r.defaultSecurity))
		copy(ep.Security, r.defaultSecurity)
	}
	if len(ep.Tags) == 0 && len(r.defaultTags) > 0 {
		ep.Tags = make([]string, len(r.defaultTags))
		copy(ep.Tags, r.defaultTags)
	}

	// Store original pattern for chi registration (relative to this router)
	chiPattern := ep.Pattern
	if chiPattern == "" {
		chiPattern = "/"
	}

	// Store full path for OpenAPI
	ep.Pattern = r.basePath + ep.Pattern

	r.endpoints = append(r.endpoints, ep)

	switch ep.Method {
	case http.MethodGet:
		r.Router.Get(chiPattern, ep.Handler)
	case http.MethodPost:
		r.Router.Post(chiPattern, ep.Handler)
	case http.MethodPut:
		r.Router.Put(chiPattern, ep.Handler)
	case http.MethodPatch:
		r.Router.Patch(chiPattern, ep.Handler)
	case http.MethodDelete:
		r.Router.Delete(chiPattern, ep.Handler)
	case http.MethodHead:
		r.Head(chiPattern, ep.Handler)
	case http.MethodOptions:
		r.Options(chiPattern, ep.Handler)
	default:
		r.Method(ep.Method, chiPattern, ep.Handler)
	}
}

// Get registers a GET endpoint
func (r *Router) Get(pattern string, handler http.HandlerFunc, opts ...EndpointOption) {
	ep := Endpoint{
		Method:  http.MethodGet,
		Pattern: pattern,
		Handler: handler,
	}
	for _, opt := range opts {
		opt(&ep)
	}
	r.Handle(ep)
}

// Post registers a POST endpoint
func (r *Router) Post(pattern string, handler http.HandlerFunc, opts ...EndpointOption) {
	ep := Endpoint{
		Method:  http.MethodPost,
		Pattern: pattern,
		Handler: handler,
	}
	for _, opt := range opts {
		opt(&ep)
	}
	r.Handle(ep)
}

// Put registers a PUT endpoint
func (r *Router) Put(pattern string, handler http.HandlerFunc, opts ...EndpointOption) {
	ep := Endpoint{
		Method:  http.MethodPut,
		Pattern: pattern,
		Handler: handler,
	}
	for _, opt := range opts {
		opt(&ep)
	}
	r.Handle(ep)
}

// Patch registers a PATCH endpoint
func (r *Router) Patch(pattern string, handler http.HandlerFunc, opts ...EndpointOption) {
	ep := Endpoint{
		Method:  http.MethodPatch,
		Pattern: pattern,
		Handler: handler,
	}
	for _, opt := range opts {
		opt(&ep)
	}
	r.Handle(ep)
}

// Delete registers a DELETE endpoint
func (r *Router) Delete(pattern string, handler http.HandlerFunc, opts ...EndpointOption) {
	ep := Endpoint{
		Method:  http.MethodDelete,
		Pattern: pattern,
		Handler: handler,
	}
	for _, opt := range opts {
		opt(&ep)
	}
	r.Handle(ep)
}

// Endpoints returns all registered endpoints (for OpenAPI generation)
func (r *Router) Endpoints() []Endpoint {
	return r.endpoints
}

// ServeHTTP implements http.Handler
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.Router.ServeHTTP(w, req)
}

// EndpointOption configures an endpoint
type EndpointOption func(*Endpoint)

// WithRequest sets the request schema
func WithRequest(req SchemaProvider) EndpointOption {
	return func(e *Endpoint) {
		e.Request = req
	}
}

// WithResponse sets the response schema
func WithResponse(resp SchemaProvider) EndpointOption {
	return func(e *Endpoint) {
		e.Response = resp
	}
}

// WithResponses sets multiple response schemas by status code
func WithResponses(responses map[int]SchemaProvider) EndpointOption {
	return func(e *Endpoint) {
		e.Responses = responses
	}
}

// WithSecurityRequirements sets the security requirements (OR relationship)
func WithSecurityRequirements(security ...Security) EndpointOption {
	return func(e *Endpoint) {
		e.Security = security
	}
}

// WithNoAuth explicitly marks endpoint as requiring no authentication
func WithNoAuth() EndpointOption {
	return func(e *Endpoint) {
		e.Security = []Security{{}}
	}
}

// WithTags sets the tags
func WithTags(tags ...string) EndpointOption {
	return func(e *Endpoint) {
		e.Tags = tags
	}
}

// WithSummary sets the summary
func WithSummary(summary string) EndpointOption {
	return func(e *Endpoint) {
		e.Summary = summary
	}
}

// WithDescription sets the description
func WithDescription(desc string) EndpointOption {
	return func(e *Endpoint) {
		e.Description = desc
	}
}

// WithOperationID sets the operation ID
func WithOperationID(id string) EndpointOption {
	return func(e *Endpoint) {
		e.OperationID = id
	}
}

// WithDeprecated marks the endpoint as deprecated
func WithDeprecated() EndpointOption {
	return func(e *Endpoint) {
		e.Deprecated = true
	}
}

// WithPathParams sets the path parameter schemas
func WithPathParams(params map[string]Schema) EndpointOption {
	return func(e *Endpoint) {
		e.PathParams = params
	}
}

// WithQueryParams sets the query parameter schemas
func WithQueryParams(params map[string]Schema) EndpointOption {
	return func(e *Endpoint) {
		e.QueryParams = params
	}
}

// WithHeaderParams sets the header parameter schemas
func WithHeaderParams(params map[string]Schema) EndpointOption {
	return func(e *Endpoint) {
		e.HeaderParams = params
	}
}

// WithCookieParams sets the cookie parameter schemas
func WithCookieParams(params map[string]Schema) EndpointOption {
	return func(e *Endpoint) {
		e.CookieParams = params
	}
}

// WithResponseDescriptions sets custom descriptions for response status codes
func WithResponseDescriptions(descriptions map[int]string) EndpointOption {
	return func(e *Endpoint) {
		e.ResponseDescriptions = descriptions
	}
}
