package chita

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ParseRequest populates a request struct from an HTTP request based on schema sources.
// It handles body, path, query, header, and cookie parameters.
// The request type must implement SchemaProvider.
//
// IMPORTANT: For fields with From(SourcePath/Query/Header/Cookie), the struct field
// MUST use `json:"-"` tag to prevent body JSON from overwriting URL-supplied values.
// The parser binds body first, then URL parameters override — but only if the struct
// field isn't populated by JSON decoding.
func ParseRequest[T SchemaProvider](r *http.Request, req T) error {
	schema := req.Schema()

	// Separate fields by source
	hasBodyFields := false
	pathFields := make(map[string]Schema)
	queryFields := make(map[string]Schema)
	headerFields := make(map[string]Schema)
	cookieFields := make(map[string]Schema)

	for name, fieldSchema := range schema.properties {
		switch fieldSchema.GetSource() {
		case SourcePath:
			pathFields[name] = fieldSchema
		case SourceQuery:
			queryFields[name] = fieldSchema
		case SourceHeader:
			headerFields[name] = fieldSchema
		case SourceCookie:
			cookieFields[name] = fieldSchema
		default:
			hasBodyFields = true
		}
	}

	// Parse body FIRST so URL parameters can override
	// (prevents mass-assignment where body overwrites path/query/header values)
	if hasBodyFields && r.Body != nil && r.ContentLength != 0 {
		if err := json.NewDecoder(r.Body).Decode(req); err != nil {
			return fmt.Errorf("body: %w", err)
		}
	}

	// Parse path parameters (overrides body)
	for name, fieldSchema := range pathFields {
		value := chi.URLParam(r, name)
		if err := setFieldValue(fieldSchema, value); err != nil {
			return fmt.Errorf("path param %q: %w", name, err)
		}
	}

	// Parse query parameters (overrides body) - cache Query() for efficiency
	if len(queryFields) > 0 {
		query := r.URL.Query()
		for name, fieldSchema := range queryFields {
			value := query.Get(name)
			if err := setFieldValue(fieldSchema, value); err != nil {
				return fmt.Errorf("query param %q: %w", name, err)
			}
		}
	}

	// Apply defaults for fields that weren't set
	applyDefaults(schema)

	// Parse header parameters (overrides body)
	for name, fieldSchema := range headerFields {
		value := r.Header.Get(name)
		if err := setFieldValue(fieldSchema, value); err != nil {
			return fmt.Errorf("header %q: %w", name, err)
		}
	}

	// Parse cookie parameters (overrides body)
	for name, fieldSchema := range cookieFields {
		cookie, err := r.Cookie(name)
		if errors.Is(err, http.ErrNoCookie) {
			continue
		}
		if err != nil {
			return fmt.Errorf("cookie %q: %w", name, err)
		}
		if err := setFieldValue(fieldSchema, cookie.Value); err != nil {
			return fmt.Errorf("cookie %q: %w", name, err)
		}
	}

	return nil
}

// setFieldValue sets the value of a schema field from a string.
func setFieldValue(schema Schema, value string) error {
	if value == "" {
		return nil
	}

	switch s := schema.(type) {
	case *StringSchema:
		s.Set(value)

	case *IntSchema:
		i, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid integer: %w", err)
		}
		s.SetInt64(i)

	case *FloatSchema:
		f, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return fmt.Errorf("invalid float: %w", err)
		}
		s.Set(f)

	case *BoolSchema:
		b, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("invalid boolean: %w", err)
		}
		s.Set(b)

	case *UUIDSchema:
		u, err := uuid.Parse(value)
		if err != nil {
			return fmt.Errorf("invalid UUID: %w", err)
		}
		s.Set(u)

	case *TimeSchema:
		var t time.Time
		var err error
		switch s.format {
		case "date":
			t, err = time.Parse("2006-01-02", value)
		case "time":
			t, err = time.Parse("15:04:05", value)
		default:
			t, err = time.Parse(time.RFC3339, value)
		}
		if err != nil {
			return fmt.Errorf("invalid time: %w", err)
		}
		s.Set(t)

	default:
		return fmt.Errorf("unsupported schema type for parameter: %T", schema)
	}

	return nil
}

// chiRegexPattern matches chi path parameter patterns like {id:[0-9]+}
var chiRegexPattern = regexp.MustCompile(`\{([^:}]+)(?::[^}]+)?\}`)

// ExtractPathParams extracts path parameter names from a chi-style pattern.
// Strips any chi regex constraints (e.g., {id:[0-9]+} → id).
func ExtractPathParams(pattern string) []string {
	matches := chiRegexPattern.FindAllStringSubmatch(pattern, -1)
	params := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) > 1 {
			params = append(params, match[1])
		}
	}
	return params
}

// ParamSourceString returns the OpenAPI "in" value for a ParamSource.
func (s ParamSource) String() string {
	switch s {
	case SourcePath:
		return "path"
	case SourceQuery:
		return "query"
	case SourceHeader:
		return "header"
	case SourceCookie:
		return "cookie"
	default:
		return "body"
	}
}

// SplitSchemaBySource separates an ObjectSchema's properties by their parameter source.
// Returns body schema and parameter schemas grouped by source location.
// Preserves property order from the original schema.
func SplitSchemaBySource(schema *ObjectSchema) (bodySchema *ObjectSchema, params map[ParamSource]map[string]Schema) {
	params = make(map[ParamSource]map[string]Schema)
	bodyProps := make(map[string]Schema)
	var bodyOrder []string

	// Use propertyOrder to maintain deterministic ordering
	for _, name := range schema.propertyOrder {
		fieldSchema := schema.properties[name]
		source := fieldSchema.GetSource()
		if source == SourceBody {
			bodyProps[name] = fieldSchema
			bodyOrder = append(bodyOrder, name)
		} else {
			if params[source] == nil {
				params[source] = make(map[string]Schema)
			}
			params[source][name] = fieldSchema
		}
	}

	if len(bodyProps) > 0 {
		bodySchema = &ObjectSchema{
			properties:      bodyProps,
			propertyOrder:   bodyOrder,
			required:        schema.required,
			additionalProps: schema.additionalProps,
			title:           schema.title,
			description:     schema.description,
		}
	}

	return
}

// BuildOpenAPIParameters generates OpenAPI parameter objects from non-body schema fields.
func BuildOpenAPIParameters(schema *ObjectSchema) []map[string]any {
	var params []map[string]any

	for name, fieldSchema := range schema.properties {
		source := fieldSchema.GetSource()
		if source == SourceBody {
			continue
		}

		openAPI := fieldSchema.OpenAPI()

		param := map[string]any{
			"name":     name,
			"in":       source.String(),
			"required": fieldSchema.IsRequired() || source == SourcePath,
			"schema":   openAPI,
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

		// Add style/explode for query array parameters
		if source == SourceQuery {
			if _, isArray := fieldSchema.(*ArraySchema); isArray {
				param["style"] = "form"
				param["explode"] = true
			}
		}

		params = append(params, param)
	}

	return params
}

// BuildOpenAPIRequestBody generates an OpenAPI request body object from body schema fields.
// Returns nil if there are no body fields.
func BuildOpenAPIRequestBody(schema *ObjectSchema, contentType string) map[string]any {
	bodySchema, _ := SplitSchemaBySource(schema)
	if bodySchema == nil {
		return nil
	}

	if contentType == "" {
		contentType = "application/json"
	}

	hasRequired := false
	for _, fieldSchema := range bodySchema.properties {
		if fieldSchema.IsRequired() {
			hasRequired = true
			break
		}
	}

	return map[string]any{
		"required": hasRequired,
		"content": map[string]any{
			contentType: map[string]any{
				"schema": bodySchema.OpenAPI(),
			},
		},
	}
}

// ParseRequestOption configures ParseRequest behavior.
type ParseRequestOption func(*parseRequestConfig)

type parseRequestConfig struct {
	disallowUnknownFields bool
}

// DisallowUnknownFields causes body parsing to fail if unknown fields are present.
func DisallowUnknownFields() ParseRequestOption {
	return func(c *parseRequestConfig) {
		c.disallowUnknownFields = true
	}
}

// ParseRequestWithOptions is like ParseRequest but accepts configuration options.
func ParseRequestWithOptions[T SchemaProvider](r *http.Request, req T, opts ...ParseRequestOption) error {
	cfg := &parseRequestConfig{}
	for _, opt := range opts {
		opt(cfg)
	}

	schema := req.Schema()

	// Separate fields by source
	hasBodyFields := false
	pathFields := make(map[string]Schema)
	queryFields := make(map[string]Schema)
	headerFields := make(map[string]Schema)
	cookieFields := make(map[string]Schema)

	for name, fieldSchema := range schema.properties {
		switch fieldSchema.GetSource() {
		case SourcePath:
			pathFields[name] = fieldSchema
		case SourceQuery:
			queryFields[name] = fieldSchema
		case SourceHeader:
			headerFields[name] = fieldSchema
		case SourceCookie:
			cookieFields[name] = fieldSchema
		default:
			hasBodyFields = true
		}
	}

	// Handle body parsing
	if r.Body != nil && r.ContentLength != 0 {
		if schema.HasBodyUnion() {
			// For body unions, capture raw body for union parsing during validation
			var rawBody json.RawMessage
			if err := json.NewDecoder(r.Body).Decode(&rawBody); err != nil {
				return fmt.Errorf("body: %w", err)
			}
			// Store in the schema's raw pointer - UnionFromSchema will parse during validation
			if rawPtr := schema.getBodyUnionRawPtr(); rawPtr != nil {
				*rawPtr = rawBody
			}
		} else if hasBodyFields {
			// Normal body parsing
			decoder := json.NewDecoder(r.Body)
			if cfg.disallowUnknownFields {
				decoder.DisallowUnknownFields()
			}
			if err := decoder.Decode(req); err != nil {
				return fmt.Errorf("body: %w", err)
			}
		}
	}

	// Parse path parameters (overrides body)
	for name, fieldSchema := range pathFields {
		value := chi.URLParam(r, name)
		if err := setFieldValue(fieldSchema, value); err != nil {
			return fmt.Errorf("path param %q: %w", name, err)
		}
	}

	// Parse query parameters (overrides body)
	if len(queryFields) > 0 {
		query := r.URL.Query()
		for name, fieldSchema := range queryFields {
			values := query[name]
			if len(values) == 0 {
				continue
			}
			// For array fields, we would need special handling
			// For now, take the first value
			if err := setFieldValue(fieldSchema, values[0]); err != nil {
				return fmt.Errorf("query param %q: %w", name, err)
			}
		}
	}

	// Parse header parameters (overrides body)
	for name, fieldSchema := range headerFields {
		value := r.Header.Get(name)
		if err := setFieldValue(fieldSchema, value); err != nil {
			return fmt.Errorf("header %q: %w", name, err)
		}
	}

	// Parse cookie parameters (overrides body)
	for name, fieldSchema := range cookieFields {
		cookie, err := r.Cookie(name)
		if errors.Is(err, http.ErrNoCookie) {
			continue
		}
		if err != nil {
			return fmt.Errorf("cookie %q: %w", name, err)
		}
		if err := setFieldValue(fieldSchema, cookie.Value); err != nil {
			return fmt.Errorf("cookie %q: %w", name, err)
		}
	}

	// Apply defaults for fields that weren't set
	applyDefaults(schema)

	return nil
}

// ParseAndValidate parses the request and validates it against the schema.
// This is the recommended way to handle requests as it ensures validation is always run.
func ParseAndValidate[T SchemaProvider](r *http.Request, req T, opts ...ParseRequestOption) error {
	if err := ParseRequestWithOptions(r, req, opts...); err != nil {
		return err
	}

	if errs := req.Schema().Validate(); len(errs) > 0 {
		return ValidationErrors(errs)
	}

	return nil
}

// ParseQueryArray extracts multiple values for a query parameter.
// Useful for ?tags=a&tags=b style parameters.
func ParseQueryArray(r *http.Request, name string) []string {
	return r.URL.Query()[name]
}

// ParseQueryArrayCSV extracts comma-separated values for a query parameter.
// Useful for ?tags=a,b,c style parameters.
func ParseQueryArrayCSV(r *http.Request, name string) []string {
	value := r.URL.Query().Get(name)
	if value == "" {
		return nil
	}
	return strings.Split(value, ",")
}

// applyDefaults applies default values to schema fields that weren't set.
// For non-body fields (query, path, etc.), if the value wasn't explicitly set and a default exists, apply it.
func applyDefaults(schema *ObjectSchema) {
	for _, fieldSchema := range schema.properties {
		switch s := fieldSchema.(type) {
		case *IntSchema:
			if s.defaultVal != nil && s.source != SourceBody && !s.IsSet() {
				s.SetInt64(*s.defaultVal)
			}
		case *StringSchema:
			if s.defaultVal != nil && s.source != SourceBody && !s.IsSet() {
				s.Set(*s.defaultVal)
			}
		case *BoolSchema:
			if s.defaultVal != nil && s.source != SourceBody && !s.IsSet() {
				s.Set(*s.defaultVal)
			}
		case *FloatSchema:
			if s.defaultVal != nil && s.source != SourceBody && !s.IsSet() {
				s.Set(*s.defaultVal)
			}
		}
	}
}
