package chita

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// ErrorBody is the JSON response shape sent to clients on error.
// Matches the Node.js backend format for API compatibility.
type ErrorBody struct {
	ReqID      string `json:"reqId,omitempty"`
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	Error      string `json:"error"`
	Details    any    `json:"details,omitempty"`
}

// ErrorHandler is a user-provided function that handles errors.
// It receives the error, performs matching/logging, and returns the response body.
type ErrorHandler func(ctx context.Context, err error) *ErrorBody

// =============================================================================
// TypedResponse — the new response interface
// =============================================================================

// TypedResponse is a response type that carries its own status code and schema.
// Implementations declare:
//   - Schema() *ObjectSchema — the OpenAPI body schema, or nil for no-content.
//   - Status() int — the HTTP status code this response produces.
type TypedResponse interface {
	Schema() *ObjectSchema
	Status() int
}

// Status mixins — embed these to avoid writing Status() manually.
//
//	type UserResponse struct {
//	    api.StatusOK
//	    ID   string `json:"id"`
//	    Name string `json:"name"`
//	}
type (
	StatusOK                  struct{} // 200
	StatusCreated             struct{} // 201
	StatusAccepted            struct{} // 202
	StatusNoContent           struct{} // 204
	StatusBadRequest          struct{} // 400
	StatusUnauthorized        struct{} // 401
	StatusForbidden           struct{} // 403
	StatusNotFound            struct{} // 404
	StatusConflict            struct{} // 409
	StatusUnprocessableEntity struct{} // 422
	StatusInternalServerError struct{} // 500
)

func (StatusOK) Status() int                  { return http.StatusOK }
func (StatusCreated) Status() int             { return http.StatusCreated }
func (StatusAccepted) Status() int            { return http.StatusAccepted }
func (StatusNoContent) Status() int           { return http.StatusNoContent }
func (StatusBadRequest) Status() int          { return http.StatusBadRequest }
func (StatusUnauthorized) Status() int        { return http.StatusUnauthorized }
func (StatusForbidden) Status() int           { return http.StatusForbidden }
func (StatusNotFound) Status() int            { return http.StatusNotFound }
func (StatusConflict) Status() int            { return http.StatusConflict }
func (StatusUnprocessableEntity) Status() int { return http.StatusUnprocessableEntity }
func (StatusInternalServerError) Status() int { return http.StatusInternalServerError }

// =============================================================================
// App
// =============================================================================

// App holds the configuration for the handler system.
type App struct {
	errorHandler     ErrorHandler
	defaultResponses []TypedResponse
	securityRegistry *SecurityRegistry
}

// AppConfig configures the App.
type AppConfig struct {
	ErrorHandler     ErrorHandler
	DefaultResponses []TypedResponse   // universal defaults (typically 400, 500)
	SecurityRegistry *SecurityRegistry // enables WithSecurity to auto-install middleware
}

// NewApp creates a new App with the given configuration.
func NewApp(cfg AppConfig) *App {
	errorHandler := cfg.ErrorHandler
	if errorHandler == nil {
		errorHandler = defaultErrorHandler
	}
	return &App{
		errorHandler:     errorHandler,
		defaultResponses: cfg.DefaultResponses,
		securityRegistry: cfg.SecurityRegistry,
	}
}

// DefaultResponses returns the app's default responses.
func (a *App) DefaultResponses() []TypedResponse {
	return a.defaultResponses
}

// SecurityRegistry returns the app's security registry, or nil if not configured.
func (a *App) SecurityRegistry() *SecurityRegistry {
	return a.securityRegistry
}

// =============================================================================
// HandlerBuilder — the new builder-based API
// =============================================================================

// ptrSchemaProvider constrains P to be a pointer to T that implements SchemaProvider.
type ptrSchemaProvider[T any] interface {
	SchemaProvider
	*T
}

// ptrTypedResponse constrains P to be a pointer to T that implements TypedResponse.
type ptrTypedResponse[T any] interface {
	TypedResponse
	*T
}

// HandlerBuilder builds a typed handler with OpenAPI metadata.
type HandlerBuilder[Req any, ReqP ptrSchemaProvider[Req], Resp any, RespP ptrTypedResponse[Resp]] struct {
	app             *App
	handler         func(context.Context, *Req) (Resp, error)
	summary         string
	description     string
	operationID     string
	tags            []string
	deprecated      bool
	security        []Security
	extraResponses  []TypedResponse
	withoutDefaults []int
}

// Handler creates a builder for a typed handler.
// Req and Resp are inferred from the fn signature.
func Handler[Req any, ReqP ptrSchemaProvider[Req], Resp any, RespP ptrTypedResponse[Resp]](
	app *App,
	fn func(context.Context, *Req) (Resp, error),
) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	return &HandlerBuilder[Req, ReqP, Resp, RespP]{
		app:     app,
		handler: fn,
	}
}

// Summary sets the OpenAPI summary.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Summary(s string) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.summary = s
	return b
}

// Description sets the OpenAPI description.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Description(s string) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.description = s
	return b
}

// OperationID sets the OpenAPI operationId.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) OperationID(s string) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.operationID = s
	return b
}

// Tags sets the OpenAPI tags.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Tags(tags ...string) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.tags = tags
	return b
}

// Deprecated marks the endpoint as deprecated.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Deprecated() *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.deprecated = true
	return b
}

// Security sets the security requirements for this endpoint.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Security(security ...Security) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.security = security
	return b
}

// Responses declares additional response variants for multi-status endpoints.
// Each argument's Status() and Schema() are read at registration time.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) Responses(extras ...TypedResponse) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.extraResponses = append(b.extraResponses, extras...)
	return b
}

// WithoutDefault suppresses inherited default responses for this endpoint.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) WithoutDefault(statusCodes ...int) *HandlerBuilder[Req, ReqP, Resp, RespP] {
	b.withoutDefaults = append(b.withoutDefaults, statusCodes...)
	return b
}

// EndpointSpec is the contract between the builder and the router.
type EndpointSpec interface {
	build(basePath string, routerDefaults []TypedResponse, routerTags []string, routerSecurity []Security) (http.HandlerFunc, Endpoint)
}

// build implements EndpointSpec.
func (b *HandlerBuilder[Req, ReqP, Resp, RespP]) build(_ string, routerDefaults []TypedResponse, routerTags []string, routerSecurity []Security) (http.HandlerFunc, Endpoint) {
	// Build http.HandlerFunc
	handler := wrapTypedHandler[Req, ReqP, Resp, RespP](b.app, b.handler)

	// Compute merged responses map
	responses := map[int]SchemaProvider{}

	// 1. App defaults
	for _, r := range b.app.defaultResponses {
		responses[r.Status()] = typedResponseSchema{r}
	}
	// 2. Router defaults
	for _, r := range routerDefaults {
		responses[r.Status()] = typedResponseSchema{r}
	}
	// 3. Handler's primary response type
	var respZero Resp
	respProvider := RespP(&respZero)
	responses[respProvider.Status()] = typedResponseSchema{respProvider}

	// 4. Extra responses declared via Responses(...)
	seen := map[int]bool{}
	for _, r := range b.extraResponses {
		status := r.Status()
		if seen[status] {
			panic(fmt.Sprintf("api: duplicate status %d in Responses()", status))
		}
		seen[status] = true
		responses[status] = typedResponseSchema{r}
	}
	// 5. Apply opt-outs
	for _, code := range b.withoutDefaults {
		delete(responses, code)
	}

	// Build request schema from type parameter
	var reqZero Req
	reqProvider := ReqP(&reqZero)

	// Determine tags
	tags := b.tags
	if len(tags) == 0 && len(routerTags) > 0 {
		tags = append([]string{}, routerTags...)
	}

	// Determine security
	security := b.security
	if security == nil && len(routerSecurity) > 0 {
		security = append([]Security{}, routerSecurity...)
	}

	return handler, Endpoint{
		Handler:     handler,
		Request:     reqProvider,
		Responses:   responses,
		Summary:     b.summary,
		Description: b.description,
		OperationID: b.operationID,
		Tags:        tags,
		Deprecated:  b.deprecated,
		Security:    security,
	}
}

// =============================================================================
// InterfaceHandler — for multi-status handlers returning interface types
// =============================================================================

// InterfaceHandlerBuilder builds a handler that returns a TypedResponse interface.
// Use this for multi-status endpoints where the response type varies at runtime.
type InterfaceHandlerBuilder[Req any, ReqP ptrSchemaProvider[Req], Resp TypedResponse] struct {
	app             *App
	handler         func(context.Context, *Req) (Resp, error)
	summary         string
	description     string
	operationID     string
	tags            []string
	deprecated      bool
	security        []Security
	responses       []TypedResponse
	withoutDefaults []int
}

// InterfaceHandler creates a builder for handlers returning interface types.
// Use Responses() to declare all possible response types for OpenAPI.
func InterfaceHandler[Req any, ReqP ptrSchemaProvider[Req], Resp TypedResponse](
	app *App,
	fn func(context.Context, *Req) (Resp, error),
) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	return &InterfaceHandlerBuilder[Req, ReqP, Resp]{
		app:     app,
		handler: fn,
	}
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Summary(s string) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.summary = s
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Description(s string) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.description = s
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) OperationID(s string) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.operationID = s
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Tags(tags ...string) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.tags = tags
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Deprecated() *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.deprecated = true
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Security(security ...Security) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.security = security
	return b
}

// Responses declares all possible response types for this endpoint.
// Required for InterfaceHandler since we can't infer from the interface type.
func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) Responses(responses ...TypedResponse) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.responses = append(b.responses, responses...)
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) WithoutDefault(statusCodes ...int) *InterfaceHandlerBuilder[Req, ReqP, Resp] {
	b.withoutDefaults = append(b.withoutDefaults, statusCodes...)
	return b
}

func (b *InterfaceHandlerBuilder[Req, ReqP, Resp]) build(_ string, routerDefaults []TypedResponse, routerTags []string, routerSecurity []Security) (http.HandlerFunc, Endpoint) {
	handler := wrapInterfaceHandler[Req, ReqP, Resp](b.app, b.handler)

	responses := map[int]SchemaProvider{}

	// 1. App defaults
	for _, r := range b.app.defaultResponses {
		responses[r.Status()] = typedResponseSchema{r}
	}
	// 2. Router defaults
	for _, r := range routerDefaults {
		responses[r.Status()] = typedResponseSchema{r}
	}
	// 3. Declared responses (required for interface handlers)
	for _, r := range b.responses {
		responses[r.Status()] = typedResponseSchema{r}
	}
	// 4. Apply opt-outs
	for _, code := range b.withoutDefaults {
		delete(responses, code)
	}

	var reqZero Req
	reqProvider := ReqP(&reqZero)

	tags := b.tags
	if len(tags) == 0 && len(routerTags) > 0 {
		tags = append([]string{}, routerTags...)
	}

	security := b.security
	if security == nil && len(routerSecurity) > 0 {
		security = append([]Security{}, routerSecurity...)
	}

	return handler, Endpoint{
		Handler:     handler,
		Request:     reqProvider,
		Responses:   responses,
		Summary:     b.summary,
		Description: b.description,
		OperationID: b.operationID,
		Tags:        tags,
		Deprecated:  b.deprecated,
		Security:    security,
	}
}

func wrapInterfaceHandler[Req any, ReqP ptrSchemaProvider[Req], Resp TypedResponse](
	app *App,
	fn func(context.Context, *Req) (Resp, error),
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		httpCtx := &HTTPContext{request: r, response: w}
		ctx = context.WithValue(ctx, httpContextKey{}, httpCtx)

		var req Req
		ptr := ReqP(&req)
		if err := ParseAndValidate(r, ptr); err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		result, err := fn(ctx, &req)
		if err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		// For interface types, call methods directly on the interface
		status := result.Status()
		schema := result.Schema()

		if schema == nil {
			w.WriteHeader(status)
			return
		}

		writeJSONResponse(w, status, result)
	}
}

// typedResponseSchema wraps a TypedResponse to implement SchemaProvider.
type typedResponseSchema struct {
	resp TypedResponse
}

func (t typedResponseSchema) Schema() *ObjectSchema {
	return t.resp.Schema()
}

// wrapTypedHandler creates the http.HandlerFunc for a typed handler.
func wrapTypedHandler[Req any, ReqP ptrSchemaProvider[Req], Resp any, RespP ptrTypedResponse[Resp]](
	app *App,
	fn func(context.Context, *Req) (Resp, error),
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		httpCtx := &HTTPContext{request: r, response: w}
		ctx = context.WithValue(ctx, httpContextKey{}, httpCtx)

		var req Req
		ptr := ReqP(&req)
		if err := ParseAndValidate(r, ptr); err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		result, err := fn(ctx, &req)
		if err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		// Status and schema come from the typed result via pointer
		respPtr := RespP(&result)
		status := respPtr.Status()
		schema := respPtr.Schema()

		if schema == nil {
			// No-content response
			w.WriteHeader(status)
			return
		}

		writeJSONResponse(w, status, result)
	}
}

// =============================================================================
// HTTPContext
// =============================================================================

// HTTPContext provides access to the underlying HTTP request/response.
type HTTPContext struct {
	request  *http.Request
	response http.ResponseWriter
}

type httpContextKey struct{}

// HTTP retrieves the HTTPContext from the context.
func HTTP(ctx context.Context) *HTTPContext {
	if h, ok := ctx.Value(httpContextKey{}).(*HTTPContext); ok {
		return h
	}
	return nil
}

func (h *HTTPContext) Request() *http.Request {
	return h.request
}

func (h *HTTPContext) ResponseWriter() http.ResponseWriter {
	return h.response
}

func (h *HTTPContext) Header(name string) string {
	return h.request.Header.Get(name)
}

func (h *HTTPContext) SetHeader(name, value string) {
	h.response.Header().Set(name, value)
}

func (h *HTTPContext) Cookie(name string) (*http.Cookie, error) {
	return h.request.Cookie(name)
}

func (h *HTTPContext) SetCookie(cookie *http.Cookie) {
	http.SetCookie(h.response, cookie)
}

// =============================================================================
// Legacy API — Result-based handlers (kept for compatibility)
// =============================================================================

// Result represents a successful response with status code and body.
type Result interface {
	statusCode() int
	body() any
}

type result struct {
	status int
	data   any
}

func (r *result) statusCode() int { return r.status }
func (r *result) body() any       { return r.data }

// Result constructors

func OK(body any) Result {
	return &result{status: http.StatusOK, data: body}
}

func Created(body any) Result {
	return &result{status: http.StatusCreated, data: body}
}

func Accepted(body any) Result {
	return &result{status: http.StatusAccepted, data: body}
}

func NoContent() Result {
	return &result{status: http.StatusNoContent, data: nil}
}

func Status(code int, body any) Result {
	return &result{status: code, data: body}
}

// LegacyHandlerFunc is the old signature for handlers returning Result.
type LegacyHandlerFunc[Req any] func(ctx context.Context, req *Req) (Result, error)

// TypedHandler bundles an HTTP handler with its request/response schemas for OpenAPI.
// Used by the legacy Handle() function.
type TypedHandler struct {
	HTTPHandler http.HandlerFunc
	Request     SchemaProvider
	Response    SchemaProvider
}

// Handle wraps a legacy Result-based handler into a TypedHandler.
//
// Deprecated: Use Handler() with typed responses instead.
func Handle[T any, P ptrSchemaProvider[T]](app *App, handler LegacyHandlerFunc[T], request, response SchemaProvider) TypedHandler {
	httpHandler := func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		httpCtx := &HTTPContext{request: r, response: w}
		ctx = context.WithValue(ctx, httpContextKey{}, httpCtx)

		var req T
		ptr := P(&req)
		if err := ParseAndValidate(r, ptr); err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		result, err := handler(ctx, &req)
		if err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		if result == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		writeJSONResponse(w, result.statusCode(), result.body())
	}

	return TypedHandler{
		HTTPHandler: httpHandler,
		Request:     request,
		Response:    response,
	}
}

// HandleFunc is a convenience for when you don't need request parsing.
//
// Deprecated: Use Handler() with typed responses instead.
func HandleFunc(app *App, handler func(ctx context.Context) (Result, error)) TypedHandler {
	httpHandler := func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		httpCtx := &HTTPContext{request: r, response: w}
		ctx = context.WithValue(ctx, httpContextKey{}, httpCtx)

		result, err := handler(ctx)
		if err != nil {
			writeErrorResponse(w, app.errorHandler(ctx, err))
			return
		}

		if result == nil {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		writeJSONResponse(w, result.statusCode(), result.body())
	}

	return TypedHandler{
		HTTPHandler: httpHandler,
	}
}

// =============================================================================
// Helpers
// =============================================================================

func writeJSONResponse(w http.ResponseWriter, status int, body any) {
	if body == nil {
		w.WriteHeader(status)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErrorResponse(w http.ResponseWriter, body *ErrorBody) {
	if body == nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(body.StatusCode)
	_ = json.NewEncoder(w).Encode(body)
}

// defaultErrorHandler provides basic error handling without logging.
func defaultErrorHandler(_ context.Context, err error) *ErrorBody {
	if apiErr, ok := AsError(err); ok {
		if apiErr.Status >= 500 {
			return &ErrorBody{
				StatusCode: apiErr.Status,
				Message:    "Something went wrong",
				Error:      apiErr.Name,
			}
		}
		return &ErrorBody{
			StatusCode: apiErr.Status,
			Message:    apiErr.Message,
			Error:      apiErr.Name,
			Details:    apiErr.Details,
		}
	}

	if validationErrs, ok := AsValidationErrors(err); ok {
		return &ErrorBody{
			StatusCode: 400,
			Message:    "Validation failed",
			Error:      "ValidationError",
			Details:    validationErrs,
		}
	}

	return &ErrorBody{
		StatusCode: 500,
		Message:    "Something went wrong",
		Error:      "InternalServerError",
	}
}
