package api

import (
	"encoding/json"
	"maps"
	"sort"
	"strconv"
	"strings"
)

// OpenAPIInfo contains API metadata
type OpenAPIInfo struct {
	Title          string
	Description    string
	Version        string
	TermsOfService string
	Contact        *OpenAPIContact
	License        *OpenAPILicense
}

// OpenAPIContact contains contact information
type OpenAPIContact struct {
	Name  string
	URL   string
	Email string
}

// OpenAPILicense contains license information
type OpenAPILicense struct {
	Name string
	URL  string
}

// OpenAPIExternalDocs contains external documentation info
type OpenAPIExternalDocs struct {
	Description string
	URL         string
}

// OpenAPITag defines an API tag with description
type OpenAPITag struct {
	Name         string
	Description  string
	ExternalDocs *OpenAPIExternalDocs
}

// OpenAPIConfig contains all configuration for OpenAPI generation
type OpenAPIConfig struct {
	// OpenAPI version (default: "3.0.3")
	OpenAPIVersion string

	// API info
	Info OpenAPIInfo

	// Server definitions
	Servers []Server

	// Security schemes available in this API
	SecuritySchemes map[string]*SecurityScheme

	// Global security requirements (applied to all endpoints unless overridden)
	Security []Security

	// Tag definitions with descriptions
	Tags []OpenAPITag

	// External documentation
	ExternalDocs *OpenAPIExternalDocs

	// Custom extensions (x-* properties) at root level
	Extensions map[string]any
}

// OpenAPISpec represents an OpenAPI 3.x specification
type OpenAPISpec struct {
	config    *OpenAPIConfig
	endpoints []Endpoint
	schemas   map[string]SchemaProvider
}

// NewOpenAPISpec creates a new OpenAPI spec generator
func NewOpenAPISpec(config *OpenAPIConfig) *OpenAPISpec {
	if config.OpenAPIVersion == "" {
		config.OpenAPIVersion = "3.0.3"
	}
	return &OpenAPISpec{
		config:  config,
		schemas: make(map[string]SchemaProvider),
	}
}

// AddEndpoints adds endpoints to the spec
func (s *OpenAPISpec) AddEndpoints(endpoints []Endpoint) {
	s.endpoints = append(s.endpoints, endpoints...)
}

// AddSchema adds a named schema (for $ref usage)
func (s *OpenAPISpec) AddSchema(name string, schema SchemaProvider) {
	s.schemas[name] = schema
}

// Generate generates the OpenAPI spec as a map
func (s *OpenAPISpec) Generate() map[string]any {
	spec := map[string]any{
		"openapi": s.config.OpenAPIVersion,
		"info":    s.generateInfo(),
	}

	if len(s.config.Servers) > 0 {
		spec["servers"] = s.generateServers()
	}

	spec["paths"] = s.generatePaths()
	spec["components"] = s.generateComponents()

	if len(s.config.Security) > 0 {
		spec["security"] = s.generateSecurityRequirements(s.config.Security)
	}

	if len(s.config.Tags) > 0 {
		spec["tags"] = s.generateTags()
	}

	if s.config.ExternalDocs != nil {
		spec["externalDocs"] = map[string]any{
			"description": s.config.ExternalDocs.Description,
			"url":         s.config.ExternalDocs.URL,
		}
	}

	maps.Copy(spec, s.config.Extensions)

	return spec
}

// JSON generates the OpenAPI spec as JSON
func (s *OpenAPISpec) JSON() ([]byte, error) {
	return json.Marshal(s.Generate())
}

// JSONIndent generates the OpenAPI spec as indented JSON
func (s *OpenAPISpec) JSONIndent(prefix, indent string) ([]byte, error) {
	return json.MarshalIndent(s.Generate(), prefix, indent)
}

func (s *OpenAPISpec) generateInfo() map[string]any {
	info := map[string]any{
		"title":   s.config.Info.Title,
		"version": s.config.Info.Version,
	}

	if s.config.Info.Description != "" {
		info["description"] = s.config.Info.Description
	}
	if s.config.Info.TermsOfService != "" {
		info["termsOfService"] = s.config.Info.TermsOfService
	}
	if s.config.Info.Contact != nil {
		contact := make(map[string]any)
		if s.config.Info.Contact.Name != "" {
			contact["name"] = s.config.Info.Contact.Name
		}
		if s.config.Info.Contact.URL != "" {
			contact["url"] = s.config.Info.Contact.URL
		}
		if s.config.Info.Contact.Email != "" {
			contact["email"] = s.config.Info.Contact.Email
		}
		info["contact"] = contact
	}
	if s.config.Info.License != nil {
		license := map[string]any{
			"name": s.config.Info.License.Name,
		}
		if s.config.Info.License.URL != "" {
			license["url"] = s.config.Info.License.URL
		}
		info["license"] = license
	}

	return info
}

func (s *OpenAPISpec) generateServers() []map[string]any {
	servers := make([]map[string]any, 0, len(s.config.Servers))

	for _, srv := range s.config.Servers {
		server := map[string]any{
			"url": srv.URL,
		}
		if srv.Description != "" {
			server["description"] = srv.Description
		}
		if len(srv.Variables) > 0 {
			vars := make(map[string]any)
			for name, v := range srv.Variables {
				varDef := map[string]any{
					"default": v.Default,
				}
				if len(v.Enum) > 0 {
					varDef["enum"] = v.Enum
				}
				if v.Description != "" {
					varDef["description"] = v.Description
				}
				vars[name] = varDef
			}
			server["variables"] = vars
		}
		servers = append(servers, server)
	}

	return servers
}

func (s *OpenAPISpec) generatePaths() map[string]any {
	paths := make(map[string]any)

	for i := range s.endpoints {
		ep := &s.endpoints[i]
		path := ep.OpenAPIPath()
		if paths[path] == nil {
			paths[path] = make(map[string]any)
		}

		pathItem, _ := paths[path].(map[string]any)
		method := strings.ToLower(ep.Method)
		pathItem[method] = s.generateOperation(ep)
	}

	return paths
}

func (s *OpenAPISpec) generateOperation(ep *Endpoint) map[string]any {
	op := make(map[string]any)

	if ep.OperationID != "" {
		op["operationId"] = ep.OperationID
	}
	if ep.Summary != "" {
		op["summary"] = ep.Summary
	}
	if ep.Description != "" {
		op["description"] = ep.Description
	}
	if len(ep.Tags) > 0 {
		op["tags"] = ep.Tags
	}
	if ep.Deprecated {
		op["deprecated"] = true
	}

	params := s.generateParameters(ep)
	if len(params) > 0 {
		op["parameters"] = params
	}

	if ep.Request != nil {
		if reqBody := s.generateRequestBody(ep); reqBody != nil {
			op["requestBody"] = reqBody
		}
	}

	op["responses"] = s.generateResponses(ep)

	if len(ep.Security) > 0 {
		op["security"] = s.generateSecurityRequirements(ep.Security)
	}

	if ep.ExternalDocsURL != "" {
		extDocs := map[string]any{"url": ep.ExternalDocsURL}
		if ep.ExternalDocsDesc != "" {
			extDocs["description"] = ep.ExternalDocsDesc
		}
		op["externalDocs"] = extDocs
	}

	if len(ep.Callbacks) > 0 {
		op["callbacks"] = ep.Callbacks
	}

	if len(ep.Servers) > 0 {
		servers := make([]map[string]any, 0, len(ep.Servers))
		for _, srv := range ep.Servers {
			server := map[string]any{"url": srv.URL}
			if srv.Description != "" {
				server["description"] = srv.Description
			}
			servers = append(servers, server)
		}
		op["servers"] = servers
	}

	maps.Copy(op, ep.Extensions)

	return op
}

func (s *OpenAPISpec) generateParameters(ep *Endpoint) []map[string]any {
	var params []map[string]any

	// If request schema exists and has source-annotated fields, use BuildOpenAPIParameters
	if ep.Request != nil {
		schema := ep.Request.Schema()
		hasSourcedFields := false
		for _, fieldSchema := range schema.properties {
			if fieldSchema.GetSource() != SourceBody {
				hasSourcedFields = true
				break
			}
		}
		if hasSourcedFields {
			return BuildOpenAPIParameters(schema)
		}
	}

	// Legacy path: use explicit PathParams/QueryParams/HeaderParams/CookieParams maps
	pathParamNames := ep.ExtractPathParams()
	for _, name := range pathParamNames {
		param := map[string]any{
			"name":     name,
			"in":       "path",
			"required": true,
		}
		if schema, ok := ep.PathParams[name]; ok {
			openAPI := schema.OpenAPI()
			param["schema"] = openAPI
			// Lift description/deprecated/example to parameter level
			if desc, ok := openAPI["description"].(string); ok && desc != "" {
				param["description"] = desc
			}
			if deprecated, ok := openAPI["deprecated"].(bool); ok && deprecated {
				param["deprecated"] = true
			}
			if example, ok := openAPI["example"]; ok {
				param["example"] = example
			}
		} else {
			param["schema"] = map[string]any{"type": "string"}
		}
		params = append(params, param)
	}

	if len(ep.QueryParams) > 0 {
		names := make([]string, 0, len(ep.QueryParams))
		for name := range ep.QueryParams {
			names = append(names, name)
		}
		sort.Strings(names)

		for _, name := range names {
			schema := ep.QueryParams[name]
			openAPI := schema.OpenAPI()
			param := map[string]any{
				"name":   name,
				"in":     "query",
				"schema": openAPI,
			}
			if schema.IsRequired() {
				param["required"] = true
			}
			// Lift description/deprecated/example
			if desc, ok := openAPI["description"].(string); ok && desc != "" {
				param["description"] = desc
			}
			if deprecated, ok := openAPI["deprecated"].(bool); ok && deprecated {
				param["deprecated"] = true
			}
			if example, ok := openAPI["example"]; ok {
				param["example"] = example
			}
			// Add style/explode for array params
			if _, isArray := schema.(*ArraySchema); isArray {
				param["style"] = "form"
				param["explode"] = true
			}
			params = append(params, param)
		}
	}

	if len(ep.HeaderParams) > 0 {
		names := make([]string, 0, len(ep.HeaderParams))
		for name := range ep.HeaderParams {
			names = append(names, name)
		}
		sort.Strings(names)

		for _, name := range names {
			schema := ep.HeaderParams[name]
			openAPI := schema.OpenAPI()
			param := map[string]any{
				"name":   name,
				"in":     "header",
				"schema": openAPI,
			}
			if schema.IsRequired() {
				param["required"] = true
			}
			if desc, ok := openAPI["description"].(string); ok && desc != "" {
				param["description"] = desc
			}
			if deprecated, ok := openAPI["deprecated"].(bool); ok && deprecated {
				param["deprecated"] = true
			}
			if example, ok := openAPI["example"]; ok {
				param["example"] = example
			}
			params = append(params, param)
		}
	}

	if len(ep.CookieParams) > 0 {
		names := make([]string, 0, len(ep.CookieParams))
		for name := range ep.CookieParams {
			names = append(names, name)
		}
		sort.Strings(names)

		for _, name := range names {
			schema := ep.CookieParams[name]
			openAPI := schema.OpenAPI()
			param := map[string]any{
				"name":   name,
				"in":     "cookie",
				"schema": openAPI,
			}
			if schema.IsRequired() {
				param["required"] = true
			}
			if desc, ok := openAPI["description"].(string); ok && desc != "" {
				param["description"] = desc
			}
			if deprecated, ok := openAPI["deprecated"].(bool); ok && deprecated {
				param["deprecated"] = true
			}
			if example, ok := openAPI["example"]; ok {
				param["example"] = example
			}
			params = append(params, param)
		}
	}

	return params
}

func (s *OpenAPISpec) generateRequestBody(ep *Endpoint) map[string]any {
	contentType := ep.RequestContentType
	if contentType == "" {
		contentType = "application/json"
	}

	schema := ep.Request.Schema()

	// Check if schema has source-annotated fields - if so, only include body fields
	hasSourcedFields := false
	for _, fieldSchema := range schema.properties {
		if fieldSchema.GetSource() != SourceBody {
			hasSourcedFields = true
			break
		}
	}

	var bodySchema map[string]any
	var hasRequired bool

	if hasSourcedFields {
		// Use SplitSchemaBySource to get only body fields
		bodySchemaSplit, _ := SplitSchemaBySource(schema)
		if bodySchemaSplit == nil {
			return nil // No body fields
		}
		bodySchema = bodySchemaSplit.OpenAPI()
		for _, fieldSchema := range bodySchemaSplit.properties {
			if fieldSchema.IsRequired() {
				hasRequired = true
				break
			}
		}
	} else {
		// Legacy: use entire schema as body
		bodySchema = schema.OpenAPI()
		for _, fieldSchema := range schema.properties {
			if fieldSchema.IsRequired() {
				hasRequired = true
				break
			}
		}
	}

	return map[string]any{
		"required": hasRequired,
		"content": map[string]any{
			contentType: map[string]any{
				"schema": bodySchema,
			},
		},
	}
}

func (s *OpenAPISpec) generateResponses(ep *Endpoint) map[string]any {
	responses := make(map[string]any)

	switch {
	case len(ep.Responses) > 0:
		for code, schema := range ep.Responses {
			desc := ep.ResponseDescriptions[code]
			if desc == "" {
				desc = defaultResponseDescription(code)
			}
			responses[statusCodeToString(code)] = s.generateResponseObject(schema, ep.ResponseContentType, desc)
		}
	case ep.Response != nil:
		desc := ep.ResponseDescriptions[200]
		if desc == "" {
			desc = "Successful response"
		}
		responses["200"] = s.generateResponseObject(ep.Response, ep.ResponseContentType, desc)
	default:
		responses["200"] = map[string]any{
			"description": "Successful response",
		}
	}

	return responses
}

func (s *OpenAPISpec) generateResponseObject(schema SchemaProvider, contentType, description string) map[string]any {
	objSchema := schema.Schema()
	if objSchema == nil {
		// No content response (e.g., 204)
		return map[string]any{
			"description": description,
		}
	}

	if contentType == "" {
		contentType = "application/json"
	}

	return map[string]any{
		"description": description,
		"content": map[string]any{
			contentType: map[string]any{
				"schema": objSchema.OpenAPI(),
			},
		},
	}
}

func defaultResponseDescription(code int) string {
	switch code {
	case 200:
		return "Successful response"
	case 201:
		return "Created"
	case 204:
		return "No content"
	case 400:
		return "Bad request"
	case 401:
		return "Unauthorized"
	case 403:
		return "Forbidden"
	case 404:
		return "Not found"
	case 409:
		return "Conflict"
	case 422:
		return "Validation error"
	case 500:
		return "Internal server error"
	default:
		if code >= 200 && code < 300 {
			return "Successful response"
		}
		if code >= 400 && code < 500 {
			return "Client error"
		}
		if code >= 500 {
			return "Server error"
		}
		return "Response"
	}
}

func (s *OpenAPISpec) generateComponents() map[string]any {
	components := make(map[string]any)

	if len(s.config.SecuritySchemes) > 0 {
		secSchemes := make(map[string]any)
		for name, scheme := range s.config.SecuritySchemes {
			secSchemes[name] = scheme.OpenAPI()
		}
		components["securitySchemes"] = secSchemes
	}

	// Merge explicitly added schemas with registry schemas
	schemas := make(map[string]any)

	// Add schemas from DefaultRegistry (registered via .Ref())
	for name, schema := range DefaultRegistry.All() {
		if refable, ok := schema.(Refable); ok {
			schemas[name] = refable.Definition()
		} else {
			schemas[name] = schema.OpenAPI()
		}
	}

	// Add explicitly registered schemas (can override registry)
	for name, provider := range s.schemas {
		schemas[name] = provider.Schema().OpenAPI()
	}

	if len(schemas) > 0 {
		components["schemas"] = schemas
	}

	return components
}

func (s *OpenAPISpec) generateSecurityRequirements(security []Security) []map[string][]string {
	result := make([]map[string][]string, 0, len(security))

	for _, sec := range security {
		result = append(result, sec.ToMap())
	}

	return result
}

func (s *OpenAPISpec) generateTags() []map[string]any {
	tags := make([]map[string]any, 0, len(s.config.Tags))

	for _, tag := range s.config.Tags {
		t := map[string]any{
			"name": tag.Name,
		}
		if tag.Description != "" {
			t["description"] = tag.Description
		}
		if tag.ExternalDocs != nil {
			t["externalDocs"] = map[string]any{
				"description": tag.ExternalDocs.Description,
				"url":         tag.ExternalDocs.URL,
			}
		}
		tags = append(tags, t)
	}

	return tags
}

func statusCodeToString(code int) string {
	return strconv.Itoa(code)
}
