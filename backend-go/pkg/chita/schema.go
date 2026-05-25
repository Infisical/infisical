package chita

import (
	"encoding/json"
	"fmt"
	"net/mail"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SchemaProvider is implemented by request/response types to provide their schema
type SchemaProvider interface {
	Schema() *ObjectSchema
}

// ParamSource indicates where a parameter value comes from
type ParamSource int

const (
	// SourceBody is the default - value comes from JSON request body
	SourceBody ParamSource = iota
	// SourcePath - value comes from URL path parameter (e.g., /users/{id})
	SourcePath
	// SourceQuery - value comes from URL query string (e.g., ?limit=10)
	SourceQuery
	// SourceHeader - value comes from HTTP header
	SourceHeader
	// SourceCookie - value comes from HTTP cookie
	SourceCookie
)

// Schema is the interface all schema types implement
type Schema interface {
	// Validate validates the bound value and returns validation errors
	Validate() []ValidationError

	// OpenAPI returns the OpenAPI schema representation
	OpenAPI() map[string]any

	// IsRequired returns whether this field is required
	IsRequired() bool

	// IsPresent returns whether the bound value is present (non-nil, non-zero)
	// Used by OneOf/AnyOf to determine which variant is active
	IsPresent() bool

	// GetSource returns where this parameter value comes from (Body by default)
	GetSource() ParamSource
}

// ValidationError represents a single validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
	Code    string `json:"code"`
}

func (e ValidationError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}
	return e.Message
}

// ValidationErrors is a collection of validation errors
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	if len(e) == 0 {
		return ""
	}
	if len(e) == 1 {
		return e[0].Error()
	}
	var sb strings.Builder
	sb.WriteString("validation failed: ")
	for i, err := range e {
		if i > 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}

// HasErrors returns true if there are any validation errors
func (e ValidationErrors) HasErrors() bool {
	return len(e) > 0
}

// --- String Schema ---

type StringSchema struct {
	ptr         *string
	required    bool
	minLength   *int
	maxLength   *int
	pattern     *regexp.Regexp
	patternStr  string
	enum        []string
	format      string
	defaultVal  *string
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func String(ptr *string) *StringSchema {
	return &StringSchema{ptr: ptr}
}

// From sets the parameter source (Path, Query, Header, Cookie). Default is Body.
func (s *StringSchema) From(source ParamSource) *StringSchema {
	s.source = source
	return s
}

func (s *StringSchema) GetSource() ParamSource {
	return s.source
}

func (s *StringSchema) Required() *StringSchema {
	s.required = true
	return s
}

func (s *StringSchema) Optional() *StringSchema {
	s.required = false
	return s
}

func (s *StringSchema) MinLength(n int) *StringSchema {
	s.minLength = &n
	return s
}

func (s *StringSchema) MaxLength(n int) *StringSchema {
	s.maxLength = &n
	return s
}

func (s *StringSchema) Length(minLen, maxLen int) *StringSchema {
	s.minLength = &minLen
	s.maxLength = &maxLen
	return s
}

// Pattern sets a regex pattern for validation. Panics on invalid regex.
// For runtime-built patterns from config, use TryPattern instead.
func (s *StringSchema) Pattern(pattern string) *StringSchema {
	s.patternStr = pattern
	s.pattern = regexp.MustCompile(pattern)
	return s
}

// TryPattern sets a regex pattern for validation, returning an error if invalid.
// Use this when patterns come from config or user input.
func (s *StringSchema) TryPattern(pattern string) (*StringSchema, error) {
	compiled, err := regexp.Compile(pattern)
	if err != nil {
		return s, err
	}
	s.patternStr = pattern
	s.pattern = compiled
	return s, nil
}

// PatternCompiled sets a pre-compiled regex pattern for validation.
func (s *StringSchema) PatternCompiled(pattern *regexp.Regexp) *StringSchema {
	s.pattern = pattern
	if pattern != nil {
		s.patternStr = pattern.String()
	}
	return s
}

func (s *StringSchema) Enum(values ...string) *StringSchema {
	s.enum = values
	return s
}

func (s *StringSchema) Format(format string) *StringSchema {
	s.format = format
	return s
}

// Email sets email format validation using RFC 5322 parsing.
// Note: This accepts RFC-compliant addresses including comments, quoted local-parts,
// and dotless domains (e.g., "user@localhost"). For stricter internet email validation,
// use EmailStrict().
func (s *StringSchema) Email() *StringSchema {
	s.format = "email"
	return s
}

// EmailStrict sets strict email format validation requiring:
// - An @ symbol with local and domain parts
// - Domain must contain at least one dot (e.g., "user@example.com")
// Use this for public-facing forms expecting internet email addresses.
func (s *StringSchema) EmailStrict() *StringSchema {
	s.format = "email-strict"
	return s
}

// URI sets URI format validation. Accepts any valid URI including relative paths.
// For absolute URLs with scheme (http/https), use URL() instead.
func (s *StringSchema) URI() *StringSchema {
	s.format = "uri"
	return s
}

// URL sets absolute URL format validation requiring a scheme (http, https, etc.)
// and host. Use this for webhook URLs, redirect URIs, etc.
func (s *StringSchema) URL() *StringSchema {
	s.format = "url"
	return s
}

func (s *StringSchema) UUID() *StringSchema {
	s.format = "uuid"
	return s
}

func (s *StringSchema) DateTime() *StringSchema {
	s.format = "date-time"
	return s
}

func (s *StringSchema) Date() *StringSchema {
	s.format = "date"
	return s
}

func (s *StringSchema) Password() *StringSchema {
	s.format = "password"
	return s
}

func (s *StringSchema) Default(val string) *StringSchema {
	s.defaultVal = &val
	return s
}

func (s *StringSchema) Example(val any) *StringSchema {
	s.example = val
	return s
}

func (s *StringSchema) Title(val string) *StringSchema {
	s.title = val
	return s
}

func (s *StringSchema) Description(val string) *StringSchema {
	s.description = val
	return s
}

func (s *StringSchema) Deprecated() *StringSchema {
	s.deprecated = true
	return s
}

func (s *StringSchema) Nullable() *StringSchema {
	s.nullable = true
	return s
}

func (s *StringSchema) ReadOnly() *StringSchema {
	s.readOnly = true
	return s
}

func (s *StringSchema) WriteOnly() *StringSchema {
	s.writeOnly = true
	return s
}

func (s *StringSchema) IsRequired() bool {
	return s.required
}

func (s *StringSchema) IsPresent() bool {
	return s.ptr != nil && *s.ptr != ""
}

func (s *StringSchema) Validate() []ValidationError {
	var errs []ValidationError
	val := ""
	if s.ptr != nil {
		val = *s.ptr
	}

	if val == "" {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
		return errs
	}

	if s.minLength != nil && len(val) < *s.minLength {
		errs = append(errs, ValidationError{
			Code:    "min_length",
			Message: fmt.Sprintf("must be at least %d characters", *s.minLength),
		})
	}

	if s.maxLength != nil && len(val) > *s.maxLength {
		errs = append(errs, ValidationError{
			Code:    "max_length",
			Message: fmt.Sprintf("must be at most %d characters", *s.maxLength),
		})
	}

	if s.pattern != nil && !s.pattern.MatchString(val) {
		errs = append(errs, ValidationError{
			Code:    "pattern",
			Message: fmt.Sprintf("must match pattern %s", s.patternStr),
		})
	}

	if len(s.enum) > 0 {
		found := slices.Contains(s.enum, val)
		if !found {
			errs = append(errs, ValidationError{
				Code:    "enum",
				Message: fmt.Sprintf("must be one of: %s", strings.Join(s.enum, ", ")),
			})
		}
	}

	if s.format != "" {
		if err := validateStringFormat(val, s.format); err != nil {
			errs = append(errs, ValidationError{Code: "format", Message: err.Error()})
		}
	}

	return errs
}

func validateStringFormat(val, format string) error {
	switch format {
	case "email":
		if _, err := mail.ParseAddress(val); err != nil {
			return fmt.Errorf("must be a valid email address")
		}
	case "email-strict":
		addr, err := mail.ParseAddress(val)
		if err != nil {
			return fmt.Errorf("must be a valid email address")
		}
		// Require @ and domain with at least one dot
		parts := strings.SplitN(addr.Address, "@", 2)
		if len(parts) != 2 || !strings.Contains(parts[1], ".") {
			return fmt.Errorf("must be a valid internet email address (e.g., user@example.com)")
		}
	case "uri":
		if _, err := url.ParseRequestURI(val); err != nil {
			return fmt.Errorf("must be a valid URI")
		}
	case "url":
		parsed, err := url.Parse(val)
		if err != nil {
			return fmt.Errorf("must be a valid URL")
		}
		if parsed.Scheme == "" {
			return fmt.Errorf("must be an absolute URL with scheme (e.g., https://example.com)")
		}
		if parsed.Host == "" {
			return fmt.Errorf("must be an absolute URL with host")
		}
	case "uuid":
		if _, err := uuid.Parse(val); err != nil {
			return fmt.Errorf("must be a valid UUID")
		}
	case "date-time":
		if _, err := time.Parse(time.RFC3339, val); err != nil {
			return fmt.Errorf("must be a valid RFC3339 date-time")
		}
	case "date":
		if _, err := time.Parse("2006-01-02", val); err != nil {
			return fmt.Errorf("must be a valid date (YYYY-MM-DD)")
		}
	}
	return nil
}

func (s *StringSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "string"}

	if s.minLength != nil {
		schema["minLength"] = *s.minLength
	}
	if s.maxLength != nil {
		schema["maxLength"] = *s.maxLength
	}
	if s.patternStr != "" {
		schema["pattern"] = s.patternStr
	}
	if len(s.enum) > 0 {
		schema["enum"] = s.enum
	}
	if s.format != "" {
		schema["format"] = s.format
	}
	if s.defaultVal != nil {
		schema["default"] = *s.defaultVal
	}
	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Int Schema ---

type IntSchema struct {
	ptr              *int
	ptr64            *int64
	required         bool
	minimum          *int64
	maximum          *int64
	exclusiveMinimum *int64
	exclusiveMaximum *int64
	multipleOf       *int64
	enum             []int64
	defaultVal       *int64
	example          any
	title            string
	description      string
	deprecated       bool
	nullable         bool
	readOnly         bool
	writeOnly        bool
	source           ParamSource
}

func Int(ptr *int) *IntSchema {
	return &IntSchema{ptr: ptr}
}

func Int64(ptr *int64) *IntSchema {
	return &IntSchema{ptr64: ptr}
}

func (s *IntSchema) From(source ParamSource) *IntSchema {
	s.source = source
	return s
}

func (s *IntSchema) GetSource() ParamSource {
	return s.source
}

func (s *IntSchema) Required() *IntSchema {
	s.required = true
	return s
}

func (s *IntSchema) Optional() *IntSchema {
	s.required = false
	return s
}

func (s *IntSchema) Min(n int64) *IntSchema {
	s.minimum = &n
	return s
}

func (s *IntSchema) Max(n int64) *IntSchema {
	s.maximum = &n
	return s
}

func (s *IntSchema) Range(minVal, maxVal int64) *IntSchema {
	s.minimum = &minVal
	s.maximum = &maxVal
	return s
}

func (s *IntSchema) ExclusiveMin(n int64) *IntSchema {
	s.exclusiveMinimum = &n
	return s
}

func (s *IntSchema) ExclusiveMax(n int64) *IntSchema {
	s.exclusiveMaximum = &n
	return s
}

func (s *IntSchema) MultipleOf(n int64) *IntSchema {
	s.multipleOf = &n
	return s
}

func (s *IntSchema) Enum(values ...int64) *IntSchema {
	s.enum = values
	return s
}

func (s *IntSchema) Default(val int64) *IntSchema {
	s.defaultVal = &val
	return s
}

func (s *IntSchema) Example(val any) *IntSchema {
	s.example = val
	return s
}

func (s *IntSchema) Title(val string) *IntSchema {
	s.title = val
	return s
}

func (s *IntSchema) Description(val string) *IntSchema {
	s.description = val
	return s
}

func (s *IntSchema) Deprecated() *IntSchema {
	s.deprecated = true
	return s
}

func (s *IntSchema) Nullable() *IntSchema {
	s.nullable = true
	return s
}

func (s *IntSchema) ReadOnly() *IntSchema {
	s.readOnly = true
	return s
}

func (s *IntSchema) WriteOnly() *IntSchema {
	s.writeOnly = true
	return s
}

func (s *IntSchema) IsRequired() bool {
	return s.required
}

func (s *IntSchema) IsPresent() bool {
	return s.ptr != nil || s.ptr64 != nil
}

//nolint:unparam // bool used for interface consistency
func (s *IntSchema) value() (int64, bool) {
	if s.ptr != nil {
		return int64(*s.ptr), true
	}
	if s.ptr64 != nil {
		return *s.ptr64, true
	}
	return 0, false
}

func (s *IntSchema) Validate() []ValidationError {
	var errs []ValidationError

	// ptr == nil means the value was not provided (distinct from value being 0)
	if s.ptr == nil && s.ptr64 == nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
		return errs
	}

	val, _ := s.value()

	if s.minimum != nil && val < *s.minimum {
		errs = append(errs, ValidationError{
			Code:    "minimum",
			Message: fmt.Sprintf("must be at least %d", *s.minimum),
		})
	}

	if s.maximum != nil && val > *s.maximum {
		errs = append(errs, ValidationError{
			Code:    "maximum",
			Message: fmt.Sprintf("must be at most %d", *s.maximum),
		})
	}

	if s.exclusiveMinimum != nil && val <= *s.exclusiveMinimum {
		errs = append(errs, ValidationError{
			Code:    "exclusive_minimum",
			Message: fmt.Sprintf("must be greater than %d", *s.exclusiveMinimum),
		})
	}

	if s.exclusiveMaximum != nil && val >= *s.exclusiveMaximum {
		errs = append(errs, ValidationError{
			Code:    "exclusive_maximum",
			Message: fmt.Sprintf("must be less than %d", *s.exclusiveMaximum),
		})
	}

	if s.multipleOf != nil && val%*s.multipleOf != 0 {
		errs = append(errs, ValidationError{
			Code:    "multiple_of",
			Message: fmt.Sprintf("must be a multiple of %d", *s.multipleOf),
		})
	}

	if len(s.enum) > 0 {
		found := slices.Contains(s.enum, val)
		if !found {
			errs = append(errs, ValidationError{
				Code:    "enum",
				Message: "must be one of the allowed values",
			})
		}
	}

	return errs
}

func (s *IntSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "integer", "format": "int64"}

	if s.minimum != nil {
		schema["minimum"] = *s.minimum
	}
	if s.maximum != nil {
		schema["maximum"] = *s.maximum
	}
	if s.exclusiveMinimum != nil {
		schema["exclusiveMinimum"] = *s.exclusiveMinimum
	}
	if s.exclusiveMaximum != nil {
		schema["exclusiveMaximum"] = *s.exclusiveMaximum
	}
	if s.multipleOf != nil {
		schema["multipleOf"] = *s.multipleOf
	}
	if len(s.enum) > 0 {
		schema["enum"] = s.enum
	}
	if s.defaultVal != nil {
		schema["default"] = *s.defaultVal
	}
	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Float Schema ---

type FloatSchema struct {
	ptr              *float64
	required         bool
	minimum          *float64
	maximum          *float64
	exclusiveMinimum *float64
	exclusiveMaximum *float64
	multipleOf       *float64
	defaultVal       *float64
	example          any
	title            string
	description      string
	deprecated       bool
	nullable         bool
	readOnly         bool
	writeOnly        bool
	source           ParamSource
}

func Float(ptr *float64) *FloatSchema {
	return &FloatSchema{ptr: ptr}
}

func (s *FloatSchema) From(source ParamSource) *FloatSchema {
	s.source = source
	return s
}

func (s *FloatSchema) GetSource() ParamSource {
	return s.source
}

func (s *FloatSchema) Required() *FloatSchema {
	s.required = true
	return s
}

func (s *FloatSchema) Optional() *FloatSchema {
	s.required = false
	return s
}

func (s *FloatSchema) Min(n float64) *FloatSchema {
	s.minimum = &n
	return s
}

func (s *FloatSchema) Max(n float64) *FloatSchema {
	s.maximum = &n
	return s
}

func (s *FloatSchema) Range(minVal, maxVal float64) *FloatSchema {
	s.minimum = &minVal
	s.maximum = &maxVal
	return s
}

func (s *FloatSchema) ExclusiveMin(n float64) *FloatSchema {
	s.exclusiveMinimum = &n
	return s
}

func (s *FloatSchema) ExclusiveMax(n float64) *FloatSchema {
	s.exclusiveMaximum = &n
	return s
}

func (s *FloatSchema) MultipleOf(n float64) *FloatSchema {
	s.multipleOf = &n
	return s
}

func (s *FloatSchema) Default(val float64) *FloatSchema {
	s.defaultVal = &val
	return s
}

func (s *FloatSchema) Example(val any) *FloatSchema {
	s.example = val
	return s
}

func (s *FloatSchema) Title(val string) *FloatSchema {
	s.title = val
	return s
}

func (s *FloatSchema) Description(val string) *FloatSchema {
	s.description = val
	return s
}

func (s *FloatSchema) Deprecated() *FloatSchema {
	s.deprecated = true
	return s
}

func (s *FloatSchema) Nullable() *FloatSchema {
	s.nullable = true
	return s
}

func (s *FloatSchema) ReadOnly() *FloatSchema {
	s.readOnly = true
	return s
}

func (s *FloatSchema) WriteOnly() *FloatSchema {
	s.writeOnly = true
	return s
}

func (s *FloatSchema) IsRequired() bool {
	return s.required
}

func (s *FloatSchema) IsPresent() bool {
	return s.ptr != nil
}

func (s *FloatSchema) Validate() []ValidationError {
	var errs []ValidationError

	// ptr == nil means the value was not provided (distinct from value being 0)
	if s.ptr == nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
		return errs
	}

	val := *s.ptr

	if s.minimum != nil && val < *s.minimum {
		errs = append(errs, ValidationError{
			Code:    "minimum",
			Message: fmt.Sprintf("must be at least %v", *s.minimum),
		})
	}

	if s.maximum != nil && val > *s.maximum {
		errs = append(errs, ValidationError{
			Code:    "maximum",
			Message: fmt.Sprintf("must be at most %v", *s.maximum),
		})
	}

	if s.exclusiveMinimum != nil && val <= *s.exclusiveMinimum {
		errs = append(errs, ValidationError{
			Code:    "exclusive_minimum",
			Message: fmt.Sprintf("must be greater than %v", *s.exclusiveMinimum),
		})
	}

	if s.exclusiveMaximum != nil && val >= *s.exclusiveMaximum {
		errs = append(errs, ValidationError{
			Code:    "exclusive_maximum",
			Message: fmt.Sprintf("must be less than %v", *s.exclusiveMaximum),
		})
	}

	return errs
}

func (s *FloatSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "number", "format": "double"}

	if s.minimum != nil {
		schema["minimum"] = *s.minimum
	}
	if s.maximum != nil {
		schema["maximum"] = *s.maximum
	}
	if s.exclusiveMinimum != nil {
		schema["exclusiveMinimum"] = *s.exclusiveMinimum
	}
	if s.exclusiveMaximum != nil {
		schema["exclusiveMaximum"] = *s.exclusiveMaximum
	}
	if s.multipleOf != nil {
		schema["multipleOf"] = *s.multipleOf
	}
	if s.defaultVal != nil {
		schema["default"] = *s.defaultVal
	}
	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Bool Schema ---

type BoolSchema struct {
	ptr         *bool
	required    bool
	defaultVal  *bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func Bool(ptr *bool) *BoolSchema {
	return &BoolSchema{ptr: ptr}
}

func (s *BoolSchema) From(source ParamSource) *BoolSchema {
	s.source = source
	return s
}

func (s *BoolSchema) GetSource() ParamSource {
	return s.source
}

func (s *BoolSchema) Required() *BoolSchema {
	s.required = true
	return s
}

func (s *BoolSchema) Optional() *BoolSchema {
	s.required = false
	return s
}

func (s *BoolSchema) Default(val bool) *BoolSchema {
	s.defaultVal = &val
	return s
}

func (s *BoolSchema) Example(val any) *BoolSchema {
	s.example = val
	return s
}

func (s *BoolSchema) Title(val string) *BoolSchema {
	s.title = val
	return s
}

func (s *BoolSchema) Description(val string) *BoolSchema {
	s.description = val
	return s
}

func (s *BoolSchema) Deprecated() *BoolSchema {
	s.deprecated = true
	return s
}

func (s *BoolSchema) Nullable() *BoolSchema {
	s.nullable = true
	return s
}

func (s *BoolSchema) ReadOnly() *BoolSchema {
	s.readOnly = true
	return s
}

func (s *BoolSchema) WriteOnly() *BoolSchema {
	s.writeOnly = true
	return s
}

func (s *BoolSchema) IsRequired() bool {
	return s.required
}

func (s *BoolSchema) IsPresent() bool {
	return s.ptr != nil
}

func (s *BoolSchema) Validate() []ValidationError {
	var errs []ValidationError

	// ptr == nil means the value was not provided (distinct from value being false)
	if s.ptr == nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
	}

	return errs
}

func (s *BoolSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "boolean"}

	if s.defaultVal != nil {
		schema["default"] = *s.defaultVal
	}
	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- UUID Schema ---

type UUIDSchema struct {
	ptr         *uuid.UUID
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func UUID(ptr *uuid.UUID) *UUIDSchema {
	return &UUIDSchema{ptr: ptr}
}

func (s *UUIDSchema) From(source ParamSource) *UUIDSchema {
	s.source = source
	return s
}

func (s *UUIDSchema) GetSource() ParamSource {
	return s.source
}

func (s *UUIDSchema) Required() *UUIDSchema {
	s.required = true
	return s
}

func (s *UUIDSchema) Optional() *UUIDSchema {
	s.required = false
	return s
}

func (s *UUIDSchema) Example(val any) *UUIDSchema {
	s.example = val
	return s
}

func (s *UUIDSchema) Title(val string) *UUIDSchema {
	s.title = val
	return s
}

func (s *UUIDSchema) Description(val string) *UUIDSchema {
	s.description = val
	return s
}

func (s *UUIDSchema) Deprecated() *UUIDSchema {
	s.deprecated = true
	return s
}

func (s *UUIDSchema) Nullable() *UUIDSchema {
	s.nullable = true
	return s
}

func (s *UUIDSchema) ReadOnly() *UUIDSchema {
	s.readOnly = true
	return s
}

func (s *UUIDSchema) WriteOnly() *UUIDSchema {
	s.writeOnly = true
	return s
}

func (s *UUIDSchema) IsRequired() bool {
	return s.required
}

func (s *UUIDSchema) IsPresent() bool {
	return s.ptr != nil && *s.ptr != uuid.Nil
}

func (s *UUIDSchema) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || *s.ptr == uuid.Nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
	}

	return errs
}

func (s *UUIDSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "string", "format": "uuid"}

	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Time Schema ---

type TimeSchema struct {
	ptr         *time.Time
	required    bool
	format      string // "date-time", "date", "time"
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func Time(ptr *time.Time) *TimeSchema {
	return &TimeSchema{ptr: ptr, format: "date-time"}
}

func (s *TimeSchema) From(source ParamSource) *TimeSchema {
	s.source = source
	return s
}

func (s *TimeSchema) GetSource() ParamSource {
	return s.source
}

func (s *TimeSchema) Required() *TimeSchema {
	s.required = true
	return s
}

func (s *TimeSchema) Optional() *TimeSchema {
	s.required = false
	return s
}

func (s *TimeSchema) DateOnly() *TimeSchema {
	s.format = "date"
	return s
}

func (s *TimeSchema) TimeOnly() *TimeSchema {
	s.format = "time"
	return s
}

func (s *TimeSchema) Example(val any) *TimeSchema {
	s.example = val
	return s
}

func (s *TimeSchema) Title(val string) *TimeSchema {
	s.title = val
	return s
}

func (s *TimeSchema) Description(val string) *TimeSchema {
	s.description = val
	return s
}

func (s *TimeSchema) Deprecated() *TimeSchema {
	s.deprecated = true
	return s
}

func (s *TimeSchema) Nullable() *TimeSchema {
	s.nullable = true
	return s
}

func (s *TimeSchema) ReadOnly() *TimeSchema {
	s.readOnly = true
	return s
}

func (s *TimeSchema) WriteOnly() *TimeSchema {
	s.writeOnly = true
	return s
}

func (s *TimeSchema) IsRequired() bool {
	return s.required
}

func (s *TimeSchema) IsPresent() bool {
	return s.ptr != nil && !s.ptr.IsZero()
}

func (s *TimeSchema) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || s.ptr.IsZero() {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
	}

	return errs
}

func (s *TimeSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "string", "format": s.format}

	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Bytes Schema ---

type BytesSchema struct {
	ptr         *[]byte
	required    bool
	minLength   *int
	maxLength   *int
	format      string // "byte" (base64), "binary"
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func Bytes(ptr *[]byte) *BytesSchema {
	return &BytesSchema{ptr: ptr, format: "byte"}
}

func (s *BytesSchema) From(source ParamSource) *BytesSchema {
	s.source = source
	return s
}

func (s *BytesSchema) GetSource() ParamSource {
	return s.source
}

func (s *BytesSchema) Required() *BytesSchema {
	s.required = true
	return s
}

func (s *BytesSchema) Optional() *BytesSchema {
	s.required = false
	return s
}

func (s *BytesSchema) MinLength(n int) *BytesSchema {
	s.minLength = &n
	return s
}

func (s *BytesSchema) MaxLength(n int) *BytesSchema {
	s.maxLength = &n
	return s
}

func (s *BytesSchema) Binary() *BytesSchema {
	s.format = "binary"
	return s
}

func (s *BytesSchema) Example(val any) *BytesSchema {
	s.example = val
	return s
}

func (s *BytesSchema) Title(val string) *BytesSchema {
	s.title = val
	return s
}

func (s *BytesSchema) Description(val string) *BytesSchema {
	s.description = val
	return s
}

func (s *BytesSchema) Deprecated() *BytesSchema {
	s.deprecated = true
	return s
}

func (s *BytesSchema) Nullable() *BytesSchema {
	s.nullable = true
	return s
}

func (s *BytesSchema) ReadOnly() *BytesSchema {
	s.readOnly = true
	return s
}

func (s *BytesSchema) WriteOnly() *BytesSchema {
	s.writeOnly = true
	return s
}

func (s *BytesSchema) IsRequired() bool {
	return s.required
}

func (s *BytesSchema) IsPresent() bool {
	return s.ptr != nil && len(*s.ptr) > 0
}

func (s *BytesSchema) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || len(*s.ptr) == 0 {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
		return errs
	}

	val := *s.ptr

	if s.minLength != nil && len(val) < *s.minLength {
		errs = append(errs, ValidationError{
			Code:    "min_length",
			Message: fmt.Sprintf("must be at least %d bytes", *s.minLength),
		})
	}

	if s.maxLength != nil && len(val) > *s.maxLength {
		errs = append(errs, ValidationError{
			Code:    "max_length",
			Message: fmt.Sprintf("must be at most %d bytes", *s.maxLength),
		})
	}

	return errs
}

func (s *BytesSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "string", "format": s.format}

	if s.minLength != nil {
		schema["minLength"] = *s.minLength
	}
	if s.maxLength != nil {
		schema["maxLength"] = *s.maxLength
	}
	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Any Schema (for free-form objects) ---

type AnySchema struct {
	ptr         *any
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func Any(ptr *any) *AnySchema {
	return &AnySchema{ptr: ptr}
}

func (s *AnySchema) From(source ParamSource) *AnySchema {
	s.source = source
	return s
}

func (s *AnySchema) GetSource() ParamSource {
	return s.source
}

func (s *AnySchema) Required() *AnySchema {
	s.required = true
	return s
}

func (s *AnySchema) Optional() *AnySchema {
	s.required = false
	return s
}

func (s *AnySchema) Example(val any) *AnySchema {
	s.example = val
	return s
}

func (s *AnySchema) Title(val string) *AnySchema {
	s.title = val
	return s
}

func (s *AnySchema) Description(val string) *AnySchema {
	s.description = val
	return s
}

func (s *AnySchema) Deprecated() *AnySchema {
	s.deprecated = true
	return s
}

func (s *AnySchema) Nullable() *AnySchema {
	s.nullable = true
	return s
}

func (s *AnySchema) ReadOnly() *AnySchema {
	s.readOnly = true
	return s
}

func (s *AnySchema) WriteOnly() *AnySchema {
	s.writeOnly = true
	return s
}

func (s *AnySchema) IsRequired() bool {
	return s.required
}

func (s *AnySchema) IsPresent() bool {
	return s.ptr != nil && *s.ptr != nil
}

func (s *AnySchema) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || *s.ptr == nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
	}

	return errs
}

func (s *AnySchema) OpenAPI() map[string]any {
	schema := map[string]any{}

	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}

// --- Raw JSON Schema (for json.RawMessage fields) ---

type RawSchema struct {
	ptr         *json.RawMessage
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	source      ParamSource
}

func Raw(ptr *json.RawMessage) *RawSchema {
	return &RawSchema{ptr: ptr}
}

func (s *RawSchema) From(source ParamSource) *RawSchema {
	s.source = source
	return s
}

func (s *RawSchema) GetSource() ParamSource {
	return s.source
}

func (s *RawSchema) Required() *RawSchema {
	s.required = true
	return s
}

func (s *RawSchema) Optional() *RawSchema {
	s.required = false
	return s
}

func (s *RawSchema) Example(val any) *RawSchema {
	s.example = val
	return s
}

func (s *RawSchema) Title(val string) *RawSchema {
	s.title = val
	return s
}

func (s *RawSchema) Description(val string) *RawSchema {
	s.description = val
	return s
}

func (s *RawSchema) Deprecated() *RawSchema {
	s.deprecated = true
	return s
}

func (s *RawSchema) Nullable() *RawSchema {
	s.nullable = true
	return s
}

func (s *RawSchema) ReadOnly() *RawSchema {
	s.readOnly = true
	return s
}

func (s *RawSchema) WriteOnly() *RawSchema {
	s.writeOnly = true
	return s
}

func (s *RawSchema) IsRequired() bool {
	return s.required
}

func (s *RawSchema) IsPresent() bool {
	return s.ptr != nil && len(*s.ptr) > 0
}

func (s *RawSchema) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || len(*s.ptr) == 0 {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
	}

	return errs
}

func (s *RawSchema) OpenAPI() map[string]any {
	schema := map[string]any{}

	if s.example != nil {
		schema["example"] = s.example
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.nullable {
		schema["nullable"] = true
	}
	if s.readOnly {
		schema["readOnly"] = true
	}
	if s.writeOnly {
		schema["writeOnly"] = true
	}

	return schema
}
