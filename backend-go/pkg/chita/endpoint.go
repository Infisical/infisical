package chita

import (
	"net/http"
)

// Endpoint represents an API endpoint with all its metadata
type Endpoint struct {
	// HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
	Method string

	// URL pattern (e.g., "/users/{id}")
	Pattern string

	// Handler function
	Handler http.HandlerFunc

	// Request body schema (nil for no body)
	Request SchemaProvider

	// Default response schema (200 status)
	Response SchemaProvider

	// Response schemas by status code
	Responses map[int]SchemaProvider

	// Response descriptions by status code (optional, defaults based on status)
	ResponseDescriptions map[int]string

	// Security requirements (OR relationship - any one suffices)
	// Use nil or empty for no auth, []Security{{}} for explicitly optional
	Security []Security

	// OpenAPI tags
	Tags []string

	// OpenAPI summary (short description)
	Summary string

	// OpenAPI description (detailed)
	Description string

	// OpenAPI operation ID
	OperationID string

	// Mark endpoint as deprecated
	Deprecated bool

	// Path parameters
	PathParams map[string]Schema

	// Query parameters
	QueryParams map[string]Schema

	// Header parameters
	HeaderParams map[string]Schema

	// Cookie parameters
	CookieParams map[string]Schema

	// Content type for request body (default: application/json)
	RequestContentType string

	// Content type for response body (default: application/json)
	ResponseContentType string

	// External documentation URL
	ExternalDocsURL string

	// External documentation description
	ExternalDocsDesc string

	// Callbacks for webhooks (OpenAPI 3.0+)
	Callbacks map[string]any

	// Server overrides for this endpoint
	Servers []Server

	// Custom extensions (x-* properties)
	Extensions map[string]any
}

// Server represents an OpenAPI server definition
type Server struct {
	URL         string
	Description string
	Variables   map[string]ServerVariable
}

// ServerVariable represents a server URL variable
type ServerVariable struct {
	Default     string
	Enum        []string
	Description string
}

// OpenAPIPath returns the OpenAPI-formatted path (converts {param} format)
func (e *Endpoint) OpenAPIPath() string {
	return e.Pattern
}

// ExtractPathParams extracts parameter names from the pattern.
// Strips chi regex constraints (e.g., {id:[0-9]+} → id).
func (e *Endpoint) ExtractPathParams() []string {
	return ExtractPathParams(e.Pattern)
}

// RequiredSchemes returns all unique scheme names referenced by this endpoint's security
func (e *Endpoint) RequiredSchemes() []string {
	seen := make(map[string]struct{})
	var schemes []string

	for _, sec := range e.Security {
		for _, req := range sec.Requirements() {
			if _, ok := seen[req.Scheme]; !ok {
				seen[req.Scheme] = struct{}{}
				schemes = append(schemes, req.Scheme)
			}
		}
	}

	return schemes
}
