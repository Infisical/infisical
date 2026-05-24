package api

import (
	"encoding/json"
	"fmt"
)

// Union is a marker interface for discriminated union types.
// Embed UnionBase in your types to implement this interface.
type Union interface {
	SchemaProvider
	unionMarker()
}

// UnionBase is an embeddable type that satisfies the Union marker interface.
// Embed this in your union variant types:
//
//	type MyVariant struct {
//	    api.UnionBase
//	    Field string `json:"field"`
//	}
type UnionBase struct{}

//nolint:unused // Implements Union interface for external packages
func (UnionBase) unionMarker() {}

// UnionDef defines a discriminated union parser
type UnionDef[T Union] struct {
	Discriminator string
	Variants      map[string]func() T
}

// Parse parses raw JSON into the appropriate union variant
func (u UnionDef[T]) Parse(data json.RawMessage) (T, error) {
	var zero T

	if len(data) == 0 || string(data) == "null" {
		return zero, nil
	}

	// Use consistent parsing path for all discriminators
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return zero, fmt.Errorf("failed to parse union: %w", err)
	}

	discRaw, ok := raw[u.Discriminator]
	if !ok {
		return zero, fmt.Errorf("missing discriminator field %q", u.Discriminator)
	}

	var discValue string
	if err := json.Unmarshal(discRaw, &discValue); err != nil {
		return zero, fmt.Errorf("invalid %s value (must be string): %w", u.Discriminator, err)
	}

	factory, ok := u.Variants[discValue]
	if !ok {
		return zero, fmt.Errorf("unknown %s value: %q", u.Discriminator, discValue)
	}

	result := factory()
	if err := json.Unmarshal(data, result); err != nil {
		return zero, fmt.Errorf("failed to unmarshal variant %q: %w", discValue, err)
	}

	return result, nil
}

// OpenAPI generates the OpenAPI schema for this union
func (u UnionDef[T]) OpenAPI() map[string]any {
	oneOf := make([]map[string]any, 0, len(u.Variants))

	for _, factory := range u.Variants {
		variant := factory()
		variantSchema := variant.Schema().OpenAPI()
		oneOf = append(oneOf, variantSchema)
	}

	// Note: mapping is omitted for inline schemas - tooling matches by
	// the discriminator property's enum value in each variant
	return map[string]any{
		"oneOf": oneOf,
		"discriminator": map[string]any{
			"propertyName": u.Discriminator,
		},
	}
}

// UnionBinding holds the binding info for a union field during JSON parsing
type UnionBinding struct {
	jsonKey string
	parse   func(raw json.RawMessage) error
}

// U creates a UnionBinding for use with ParseUnions
func U[T Union](jsonKey string, target *T, parser UnionDef[T]) UnionBinding {
	return UnionBinding{
		jsonKey: jsonKey,
		parse: func(raw json.RawMessage) error {
			parsed, err := parser.Parse(raw)
			if err != nil {
				return err
			}
			*target = parsed
			return nil
		},
	}
}

// ParseUnions parses union fields from raw JSON data.
//
// Deprecated: Use ParseUnionField with json.RawMessage for better performance.
func ParseUnions(data []byte, bindings ...UnionBinding) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return fmt.Errorf("failed to parse JSON: %w", err)
	}

	for _, b := range bindings {
		rawField, ok := raw[b.jsonKey]
		if !ok || string(rawField) == "null" {
			continue
		}
		if err := b.parse(rawField); err != nil {
			return fmt.Errorf("%s: %w", b.jsonKey, err)
		}
	}

	return nil
}

// ParseUnionField parses a union from a json.RawMessage field.
// Use this with json.RawMessage struct fields to avoid double JSON parsing.
//
// Example:
//
//	type Request struct {
//	    AuthRaw json.RawMessage `json:"auth"`
//	    Auth    AuthMethod      `json:"-"`
//	}
//
//	func (r *Request) UnmarshalJSON(data []byte) error {
//	    type Plain Request
//	    if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
//	        return err
//	    }
//	    return api.ParseUnionField(r.AuthRaw, &r.Auth, AuthParser)
//	}
func ParseUnionField[T Union](raw json.RawMessage, target *T, parser UnionDef[T]) error {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	parsed, err := parser.Parse(raw)
	if err != nil {
		return err
	}
	*target = parsed
	return nil
}

// NestedUnionDef defines a discriminated union where the discriminator
// and payload are in separate fields.
//
// Example JSON: {"method": "password", "payload": {"username": "...", "password": "..."}}
type NestedUnionDef[T Union] struct {
	Discriminator string              // Field name containing the type (e.g., "method")
	PayloadField  string              // Field name containing the payload (e.g., "payload")
	Variants      map[string]func() T // Factory functions for each variant
}

// Parse parses a nested union from JSON containing discriminator and payload fields
func (u NestedUnionDef[T]) Parse(data json.RawMessage) (T, error) {
	var zero T

	if len(data) == 0 || string(data) == "null" {
		return zero, nil
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return zero, fmt.Errorf("failed to parse nested union: %w", err)
	}

	// Extract discriminator
	discRaw, ok := raw[u.Discriminator]
	if !ok {
		return zero, fmt.Errorf("missing discriminator field %q", u.Discriminator)
	}
	var discValue string
	if err := json.Unmarshal(discRaw, &discValue); err != nil {
		return zero, fmt.Errorf("invalid discriminator value: %w", err)
	}

	factory, ok := u.Variants[discValue]
	if !ok {
		return zero, fmt.Errorf("unknown %s value: %q", u.Discriminator, discValue)
	}

	// Extract and unmarshal payload
	payloadRaw, ok := raw[u.PayloadField]
	if !ok || string(payloadRaw) == "null" {
		return zero, fmt.Errorf("missing %s field", u.PayloadField)
	}

	result := factory()
	if err := json.Unmarshal(payloadRaw, result); err != nil {
		return zero, fmt.Errorf("failed to unmarshal %s for %q: %w", u.PayloadField, discValue, err)
	}

	return result, nil
}

// ParseWithType parses a payload with an already-known type.
// Returns an error if payload is null/empty since the OpenAPI schema marks it required.
func (u NestedUnionDef[T]) ParseWithType(typeName string, payload json.RawMessage) (T, error) {
	var zero T

	factory, ok := u.Variants[typeName]
	if !ok {
		return zero, fmt.Errorf("unknown type: %q", typeName)
	}

	if len(payload) == 0 || string(payload) == "null" {
		return zero, fmt.Errorf("missing %s for type %q", u.PayloadField, typeName)
	}

	result := factory()
	if err := json.Unmarshal(payload, result); err != nil {
		return zero, fmt.Errorf("failed to unmarshal payload: %w", err)
	}

	return result, nil
}

// OpenAPI generates the OpenAPI schema for this nested union
func (u NestedUnionDef[T]) OpenAPI() map[string]any {
	payloadOneOf := make([]map[string]any, 0, len(u.Variants))
	mapping := make(map[string]string)
	enumValues := make([]string, 0, len(u.Variants))

	for typeName, factory := range u.Variants {
		variant := factory()
		payloadOneOf = append(payloadOneOf, variant.Schema().OpenAPI())
		mapping[typeName] = fmt.Sprintf("#/components/schemas/%s", typeName)
		enumValues = append(enumValues, typeName)
	}

	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			u.Discriminator: map[string]any{
				"type": "string",
				"enum": enumValues,
			},
			u.PayloadField: map[string]any{
				"oneOf": payloadOneOf,
			},
		},
		"required": []string{u.Discriminator, u.PayloadField},
	}
}

// ParseNestedUnionField parses a nested union from separate discriminator and payload fields
func ParseNestedUnionField[T Union](discriminatorRaw, payloadRaw json.RawMessage, target *T, parser NestedUnionDef[T]) error {
	if len(discriminatorRaw) == 0 || string(discriminatorRaw) == "null" {
		return nil
	}

	var discriminator string
	if err := json.Unmarshal(discriminatorRaw, &discriminator); err != nil {
		return fmt.Errorf("invalid discriminator: %w", err)
	}

	parsed, err := parser.ParseWithType(discriminator, payloadRaw)
	if err != nil {
		return err
	}
	*target = parsed
	return nil
}

// UnionFromSchema provides a connected union experience - parsing, validation, and OpenAPI in one.
// It binds a json.RawMessage field to a parsed union target.
type UnionFromSchema[T Union] struct {
	rawPtr         *json.RawMessage
	targetPtr      *T
	parser         UnionDef[T]
	required       bool
	defaultVariant string
	example        any
	title          string
	description    string
	deprecated     bool
	nullable       bool
}

// UnionFrom creates a schema that parses a union from raw JSON during validation.
// The raw JSON is read from rawPtr, parsed using the parser, and stored in targetPtr.
// This provides a connected experience: OpenAPI generation + parsing + validation in one schema.
//
// Example:
//
//	type Request struct {
//	    TargetRaw json.RawMessage `json:"target"`
//	    Target    WebhookTarget   `json:"-"`
//	}
//
//	func (r *Request) Schema() *api.ObjectSchema {
//	    return api.Object(map[string]api.Schema{
//	        "target": api.UnionFrom(&r.TargetRaw, &r.Target, WebhookTargetParser).Required(),
//	    })
//	}
func UnionFrom[T Union](rawPtr *json.RawMessage, targetPtr *T, parser UnionDef[T]) *UnionFromSchema[T] {
	return &UnionFromSchema[T]{
		rawPtr:    rawPtr,
		targetPtr: targetPtr,
		parser:    parser,
	}
}

func (s *UnionFromSchema[T]) Required() *UnionFromSchema[T] {
	s.required = true
	return s
}

func (s *UnionFromSchema[T]) Optional() *UnionFromSchema[T] {
	s.required = false
	return s
}

// DefaultVariant sets the discriminator value to use when the field is absent.
// The variant will be created with its own field defaults applied.
func (s *UnionFromSchema[T]) DefaultVariant(discriminator string) *UnionFromSchema[T] {
	s.defaultVariant = discriminator
	return s
}

func (s *UnionFromSchema[T]) Example(val any) *UnionFromSchema[T] {
	s.example = val
	return s
}

func (s *UnionFromSchema[T]) Title(val string) *UnionFromSchema[T] {
	s.title = val
	return s
}

func (s *UnionFromSchema[T]) Description(val string) *UnionFromSchema[T] {
	s.description = val
	return s
}

func (s *UnionFromSchema[T]) Deprecated() *UnionFromSchema[T] {
	s.deprecated = true
	return s
}

func (s *UnionFromSchema[T]) Nullable() *UnionFromSchema[T] {
	s.nullable = true
	return s
}

func (s *UnionFromSchema[T]) IsRequired() bool {
	return s.required
}

func (s *UnionFromSchema[T]) GetSource() ParamSource {
	return SourceBody
}

func (s *UnionFromSchema[T]) IsPresent() bool {
	return s.rawPtr != nil && len(*s.rawPtr) > 0 && string(*s.rawPtr) != "null"
}

func (s *UnionFromSchema[T]) Validate() []ValidationError {
	// Check if raw data is present
	hasData := s.rawPtr != nil && len(*s.rawPtr) > 0 && string(*s.rawPtr) != "null"

	if !hasData {
		// No data - check for default variant
		if s.defaultVariant != "" {
			factory, ok := s.parser.Variants[s.defaultVariant]
			if !ok {
				return []ValidationError{{
					Code:    "invalid_default",
					Message: fmt.Sprintf("unknown default variant: %q", s.defaultVariant),
				}}
			}
			variant := factory()
			*s.targetPtr = variant

			// Apply defaults to variant fields
			variantSchema := variant.Schema()
			applySchemaDefaults(variantSchema)

			// Validate the variant
			return variantSchema.Validate()
		}

		if s.required {
			return []ValidationError{{Code: "required", Message: "is required"}}
		}
		return nil
	}

	// Parse the union from raw JSON
	parsed, err := s.parser.Parse(*s.rawPtr)
	if err != nil {
		return []ValidationError{{Code: "invalid_union", Message: err.Error()}}
	}

	*s.targetPtr = parsed

	// Apply defaults to variant fields
	variantSchema := parsed.Schema()
	applySchemaDefaults(variantSchema)

	// Validate the variant
	return variantSchema.Validate()
}

func (s *UnionFromSchema[T]) OpenAPI() map[string]any {
	schema := s.parser.OpenAPI()

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
	if s.defaultVariant != "" {
		schema["default"] = map[string]any{s.parser.Discriminator: s.defaultVariant}
	}

	return schema
}

// applySchemaDefaults applies default values to body fields in an ObjectSchema.
// This is used for union variants after parsing.
func applySchemaDefaults(schema *ObjectSchema) {
	for _, fieldSchema := range schema.properties {
		switch s := fieldSchema.(type) {
		case *IntSchema:
			if s.defaultVal != nil {
				val, _ := s.value()
				if val == 0 {
					if s.ptr != nil {
						*s.ptr = int(*s.defaultVal)
					}
					if s.ptr64 != nil {
						*s.ptr64 = *s.defaultVal
					}
				}
			}
		case *StringSchema:
			if s.defaultVal != nil && s.ptr != nil && *s.ptr == "" {
				*s.ptr = *s.defaultVal
			}
		case *BoolSchema:
			// For bool, only apply default if we have a way to track "not set"
			// Since false is a valid value, we skip this for now
		case *FloatSchema:
			if s.defaultVal != nil && s.ptr != nil && *s.ptr == 0 {
				*s.ptr = *s.defaultVal
			}
		}
	}
}

// UnionSchema creates a Schema for a union field
type UnionSchema[T Union] struct {
	parser      UnionDef[T]
	ptr         *T
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
}

func UnionField[T Union](ptr *T, parser UnionDef[T]) *UnionSchema[T] {
	return &UnionSchema[T]{
		parser: parser,
		ptr:    ptr,
	}
}

func (s *UnionSchema[T]) Required() *UnionSchema[T] {
	s.required = true
	return s
}

func (s *UnionSchema[T]) Optional() *UnionSchema[T] {
	s.required = false
	return s
}

func (s *UnionSchema[T]) Example(val any) *UnionSchema[T] {
	s.example = val
	return s
}

func (s *UnionSchema[T]) Title(val string) *UnionSchema[T] {
	s.title = val
	return s
}

func (s *UnionSchema[T]) Description(val string) *UnionSchema[T] {
	s.description = val
	return s
}

func (s *UnionSchema[T]) Deprecated() *UnionSchema[T] {
	s.deprecated = true
	return s
}

func (s *UnionSchema[T]) Nullable() *UnionSchema[T] {
	s.nullable = true
	return s
}

func (s *UnionSchema[T]) IsRequired() bool {
	return s.required
}

func (s *UnionSchema[T]) GetSource() ParamSource {
	return SourceBody
}

func (s *UnionSchema[T]) IsPresent() bool {
	return s.ptr != nil && any(*s.ptr) != nil
}

func (s *UnionSchema[T]) Validate() []ValidationError {
	var errs []ValidationError

	if s.ptr == nil || any(*s.ptr) == nil {
		if s.required {
			errs = append(errs, ValidationError{Code: "required", Message: "is required"})
		}
		return errs
	}

	unionVal := *s.ptr
	schema := unionVal.Schema()
	if schema != nil {
		errs = append(errs, schema.Validate()...)
	}

	return errs
}

func (s *UnionSchema[T]) OpenAPI() map[string]any {
	schema := s.parser.OpenAPI()

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

	return schema
}

// BodyUnionBuilder helps build ObjectSchema with root-level body unions
type BodyUnionBuilder[T Union] struct {
	rawPtr    *json.RawMessage
	targetPtr *T
	parser    UnionDef[T]
	fields    map[string]Schema
}

// BodyUnion creates an ObjectSchema where the request body IS a union.
// Use this when the entire request body is a discriminated union, not wrapped in a field.
//
// Example:
//
//	type LoginRequest struct {
//	    OrgSlug string          `json:"-"`
//	    BodyRaw json.RawMessage `json:"-"`
//	    Auth    AuthMethod      `json:"-"`
//	}
//
//	func (r *LoginRequest) Schema() *api.ObjectSchema {
//	    return api.BodyUnion(&r.BodyRaw, &r.Auth, AuthMethodParser).
//	        WithFields(map[string]api.Schema{
//	            "orgSlug": api.String(&r.OrgSlug).Required().From(api.SourcePath),
//	        })
//	}
func BodyUnion[T Union](rawPtr *json.RawMessage, targetPtr *T, parser UnionDef[T]) *BodyUnionBuilder[T] {
	return &BodyUnionBuilder[T]{
		rawPtr:    rawPtr,
		targetPtr: targetPtr,
		parser:    parser,
	}
}

// WithFields adds non-body fields (path, query, header params) to the schema
func (b *BodyUnionBuilder[T]) WithFields(fields map[string]Schema) *ObjectSchema {
	unionSchema := UnionFrom(b.rawPtr, b.targetPtr, b.parser).Required()

	order := make([]string, 0, len(fields))
	for k := range fields {
		order = append(order, k)
	}

	return &ObjectSchema{
		properties:    fields,
		propertyOrder: order,
		bodyUnion: &bodyUnionConfig{
			rawPtr:    b.rawPtr,
			targetPtr: b.targetPtr,
			parser:    b.parser,
			schema:    unionSchema,
		},
	}
}

// Build creates the ObjectSchema with just the body union (no extra fields)
func (b *BodyUnionBuilder[T]) Build() *ObjectSchema {
	return b.WithFields(nil)
}
