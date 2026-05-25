package api

import (
	"encoding/json"
	"fmt"
)

// --- Object Schema ---

type ObjectSchema struct {
	properties       map[string]Schema
	propertyOrder    []string
	required         bool
	additionalProps  *bool
	minProperties    *int
	maxProperties    *int
	example          any
	title            string
	description      string
	deprecated       bool
	nullable         bool
	readOnly         bool
	writeOnly        bool
	discriminator    string
	discriminatorMap map[string]string
	refName          string

	// For root-level unions (body IS the union)
	bodyUnion *bodyUnionConfig
}

// bodyUnionConfig holds configuration for root-level union bodies
type bodyUnionConfig struct {
	rawPtr    any    // *json.RawMessage
	targetPtr any    // *T where T is the union interface
	parser    any    // UnionDef[T]
	schema    Schema // The union schema for OpenAPI/validation
}

func Object(fields map[string]Schema) *ObjectSchema {
	order := make([]string, 0, len(fields))
	for k := range fields {
		order = append(order, k)
	}
	return &ObjectSchema{
		properties:    fields,
		propertyOrder: order,
	}
}

func (s *ObjectSchema) Required() *ObjectSchema {
	s.required = true
	return s
}

func (s *ObjectSchema) Optional() *ObjectSchema {
	s.required = false
	return s
}

// AdditionalProperties sets the OpenAPI additionalProperties field.
// NOTE: This is OpenAPI metadata only — it does NOT enforce validation.
// To reject unknown fields at parse time, use json.Decoder.DisallowUnknownFields():
//
//	decoder := json.NewDecoder(r.Body)
//	decoder.DisallowUnknownFields()
//	if err := decoder.Decode(&req); err != nil { ... }
func (s *ObjectSchema) AdditionalProperties(allow bool) *ObjectSchema {
	s.additionalProps = &allow
	return s
}

func (s *ObjectSchema) MinProperties(n int) *ObjectSchema {
	s.minProperties = &n
	return s
}

func (s *ObjectSchema) MaxProperties(n int) *ObjectSchema {
	s.maxProperties = &n
	return s
}

func (s *ObjectSchema) Example(val any) *ObjectSchema {
	s.example = val
	return s
}

func (s *ObjectSchema) Title(val string) *ObjectSchema {
	s.title = val
	return s
}

func (s *ObjectSchema) Description(val string) *ObjectSchema {
	s.description = val
	return s
}

func (s *ObjectSchema) Deprecated() *ObjectSchema {
	s.deprecated = true
	return s
}

func (s *ObjectSchema) Nullable() *ObjectSchema {
	s.nullable = true
	return s
}

func (s *ObjectSchema) ReadOnly() *ObjectSchema {
	s.readOnly = true
	return s
}

func (s *ObjectSchema) WriteOnly() *ObjectSchema {
	s.writeOnly = true
	return s
}

func (s *ObjectSchema) Discriminator(propertyName string, mapping map[string]string) *ObjectSchema {
	s.discriminator = propertyName
	s.discriminatorMap = mapping
	return s
}

// HasBodyUnion returns true if this schema has a root-level body union configured
func (s *ObjectSchema) HasBodyUnion() bool {
	return s.bodyUnion != nil
}

// GetBodyUnionSchema returns the union schema for the body, or nil if not set
func (s *ObjectSchema) GetBodyUnionSchema() Schema {
	if s.bodyUnion != nil {
		return s.bodyUnion.schema
	}
	return nil
}

// getBodyUnionRawPtr returns the raw JSON pointer for the body union
func (s *ObjectSchema) getBodyUnionRawPtr() *json.RawMessage {
	if s.bodyUnion != nil {
		if rawPtr, ok := s.bodyUnion.rawPtr.(*json.RawMessage); ok {
			return rawPtr
		}
	}
	return nil
}

func (s *ObjectSchema) IsRequired() bool {
	return s.required
}

func (s *ObjectSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *ObjectSchema) IsPresent() bool {
	// Object is present if any of its properties are present
	for _, schema := range s.properties {
		if schema.IsPresent() {
			return true
		}
	}
	return false
}

func (s *ObjectSchema) Validate() []ValidationError {
	var errs []ValidationError

	// Validate regular properties
	for field, schema := range s.properties {
		fieldErrs := schema.Validate()
		for _, e := range fieldErrs {
			inner := e.Field
			if inner != "" {
				e.Field = field + "." + inner
			} else {
				e.Field = field
			}
			errs = append(errs, e)
		}
	}

	// Validate body union if present
	if s.bodyUnion != nil && s.bodyUnion.schema != nil {
		errs = append(errs, s.bodyUnion.schema.Validate()...)
	}

	return errs
}

// Ref registers this schema in the default registry and makes OpenAPI() return a $ref.
// Use this for reusable schemas that should appear in components/schemas.
func (s *ObjectSchema) Ref(name string) *ObjectSchema {
	s.refName = name
	DefaultRegistry.Register(name, s)
	return s
}

// RefName returns the registered ref name, or empty if not a ref.
func (s *ObjectSchema) RefName() string {
	return s.refName
}

// Definition returns the full schema definition, ignoring any ref.
// Use this when you need the actual schema structure (e.g., for components/schemas).
func (s *ObjectSchema) Definition() map[string]any {
	return s.definition()
}

func (s *ObjectSchema) OpenAPI() map[string]any {
	if s.refName != "" {
		return map[string]any{"$ref": "#/components/schemas/" + s.refName}
	}
	return s.definition()
}

func (s *ObjectSchema) definition() map[string]any {
	schema := map[string]any{"type": "object"}

	if len(s.properties) > 0 {
		props := make(map[string]any)
		var requiredFields []string

		// Use propertyOrder for deterministic iteration
		for _, field := range s.propertyOrder {
			fieldSchema := s.properties[field]
			props[field] = fieldSchema.OpenAPI()
			if fieldSchema.IsRequired() {
				requiredFields = append(requiredFields, field)
			}
		}

		schema["properties"] = props
		if len(requiredFields) > 0 {
			schema["required"] = requiredFields
		}
	}

	if s.additionalProps != nil {
		schema["additionalProperties"] = *s.additionalProps
	}
	if s.minProperties != nil {
		schema["minProperties"] = *s.minProperties
	}
	if s.maxProperties != nil {
		schema["maxProperties"] = *s.maxProperties
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
	if s.discriminator != "" {
		disc := map[string]any{"propertyName": s.discriminator}
		if len(s.discriminatorMap) > 0 {
			disc["mapping"] = s.discriminatorMap
		}
		schema["discriminator"] = disc
	}

	return schema
}

// --- Array Schema ---

type ArraySchema struct {
	items       Schema
	required    bool
	minItems    *int
	maxItems    *int
	uniqueItems bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool
	refName     string

	validateFn  func() []ValidationError
	isPresentFn func() bool
}

func Array(items Schema) *ArraySchema {
	return &ArraySchema{items: items}
}

func (s *ArraySchema) Required() *ArraySchema {
	s.required = true
	return s
}

func (s *ArraySchema) Optional() *ArraySchema {
	s.required = false
	return s
}

func (s *ArraySchema) MinItems(n int) *ArraySchema {
	s.minItems = &n
	return s
}

func (s *ArraySchema) MaxItems(n int) *ArraySchema {
	s.maxItems = &n
	return s
}

func (s *ArraySchema) UniqueItems() *ArraySchema {
	s.uniqueItems = true
	return s
}

func (s *ArraySchema) Example(val any) *ArraySchema {
	s.example = val
	return s
}

func (s *ArraySchema) Title(val string) *ArraySchema {
	s.title = val
	return s
}

func (s *ArraySchema) Description(val string) *ArraySchema {
	s.description = val
	return s
}

func (s *ArraySchema) Deprecated() *ArraySchema {
	s.deprecated = true
	return s
}

func (s *ArraySchema) Nullable() *ArraySchema {
	s.nullable = true
	return s
}

func (s *ArraySchema) ReadOnly() *ArraySchema {
	s.readOnly = true
	return s
}

func (s *ArraySchema) WriteOnly() *ArraySchema {
	s.writeOnly = true
	return s
}

func (s *ArraySchema) ValidateFn(fn func() []ValidationError) *ArraySchema {
	s.validateFn = fn
	return s
}

func (s *ArraySchema) IsPresentFn(fn func() bool) *ArraySchema {
	s.isPresentFn = fn
	return s
}

func (s *ArraySchema) IsRequired() bool {
	return s.required
}

func (s *ArraySchema) GetSource() ParamSource {
	return SourceBody
}

func (s *ArraySchema) IsPresent() bool {
	if s.isPresentFn != nil {
		return s.isPresentFn()
	}
	return false
}

func (s *ArraySchema) Validate() []ValidationError {
	if s.validateFn != nil {
		return s.validateFn()
	}
	return nil
}

// Ref registers this schema in the default registry and makes OpenAPI() return a $ref.
func (s *ArraySchema) Ref(name string) *ArraySchema {
	s.refName = name
	DefaultRegistry.Register(name, s)
	return s
}

// RefName returns the registered ref name, or empty if not a ref.
func (s *ArraySchema) RefName() string {
	return s.refName
}

// Definition returns the full schema definition, ignoring any ref.
func (s *ArraySchema) Definition() map[string]any {
	return s.definition()
}

func (s *ArraySchema) OpenAPI() map[string]any {
	if s.refName != "" {
		return map[string]any{"$ref": "#/components/schemas/" + s.refName}
	}
	return s.definition()
}

func (s *ArraySchema) definition() map[string]any {
	schema := map[string]any{"type": "array"}

	if s.items != nil {
		schema["items"] = s.items.OpenAPI()
	}
	if s.minItems != nil {
		schema["minItems"] = *s.minItems
	}
	if s.maxItems != nil {
		schema["maxItems"] = *s.maxItems
	}
	if s.uniqueItems {
		schema["uniqueItems"] = true
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

// --- Map Schema (string keys, typed values) ---

type MapSchema struct {
	valueSchema Schema
	required    bool
	minProps    *int
	maxProps    *int
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
	readOnly    bool
	writeOnly   bool

	validateFn  func() []ValidationError
	isPresentFn func() bool
}

func Map(valueSchema Schema) *MapSchema {
	return &MapSchema{valueSchema: valueSchema}
}

func (s *MapSchema) Required() *MapSchema {
	s.required = true
	return s
}

func (s *MapSchema) Optional() *MapSchema {
	s.required = false
	return s
}

func (s *MapSchema) MinProperties(n int) *MapSchema {
	s.minProps = &n
	return s
}

func (s *MapSchema) MaxProperties(n int) *MapSchema {
	s.maxProps = &n
	return s
}

func (s *MapSchema) Example(val any) *MapSchema {
	s.example = val
	return s
}

func (s *MapSchema) Title(val string) *MapSchema {
	s.title = val
	return s
}

func (s *MapSchema) Description(val string) *MapSchema {
	s.description = val
	return s
}

func (s *MapSchema) Deprecated() *MapSchema {
	s.deprecated = true
	return s
}

func (s *MapSchema) Nullable() *MapSchema {
	s.nullable = true
	return s
}

func (s *MapSchema) ReadOnly() *MapSchema {
	s.readOnly = true
	return s
}

func (s *MapSchema) WriteOnly() *MapSchema {
	s.writeOnly = true
	return s
}

func (s *MapSchema) ValidateFn(fn func() []ValidationError) *MapSchema {
	s.validateFn = fn
	return s
}

func (s *MapSchema) IsPresentFn(fn func() bool) *MapSchema {
	s.isPresentFn = fn
	return s
}

func (s *MapSchema) IsRequired() bool {
	return s.required
}

func (s *MapSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *MapSchema) IsPresent() bool {
	if s.isPresentFn != nil {
		return s.isPresentFn()
	}
	return false
}

func (s *MapSchema) Validate() []ValidationError {
	if s.validateFn != nil {
		return s.validateFn()
	}
	return nil
}

func (s *MapSchema) OpenAPI() map[string]any {
	schema := map[string]any{"type": "object"}

	if s.valueSchema != nil {
		schema["additionalProperties"] = s.valueSchema.OpenAPI()
	}
	if s.minProps != nil {
		schema["minProperties"] = *s.minProps
	}
	if s.maxProps != nil {
		schema["maxProperties"] = *s.maxProps
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

// --- OneOf Schema (discriminated union) ---

type OneOfSchema struct {
	// For discriminated union (with type field)
	discriminator string
	variants      map[string]SchemaProvider
	activeVariant *string // which variant is active (for validation)

	// For simple oneOf (exactly one of these schemas must match)
	schemas []Schema

	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool

	validateFn func() []ValidationError
}

// OneOf creates a discriminated union schema with a type discriminator.
// For validation to work, call SetActiveVariant() with the discriminator value
// after determining which variant is active (usually after JSON parsing).
func OneOf(discriminator string, variants map[string]SchemaProvider) *OneOfSchema {
	return &OneOfSchema{
		discriminator: discriminator,
		variants:      variants,
	}
}

// OneOfSchemas creates a oneOf schema where exactly one of the schemas must be present
// Use this for "either A or B" patterns without a discriminator field
func OneOfSchemas(schemas ...Schema) *OneOfSchema {
	return &OneOfSchema{
		schemas: schemas,
	}
}

// SetActiveVariant sets which variant is active for discriminated oneOf validation.
// Call this after JSON parsing with the value of the discriminator field.
func (s *OneOfSchema) SetActiveVariant(variantKey string) *OneOfSchema {
	s.activeVariant = &variantKey
	return s
}

func (s *OneOfSchema) Required() *OneOfSchema {
	s.required = true
	return s
}

func (s *OneOfSchema) Optional() *OneOfSchema {
	s.required = false
	return s
}

func (s *OneOfSchema) Example(val any) *OneOfSchema {
	s.example = val
	return s
}

func (s *OneOfSchema) Title(val string) *OneOfSchema {
	s.title = val
	return s
}

func (s *OneOfSchema) Description(val string) *OneOfSchema {
	s.description = val
	return s
}

func (s *OneOfSchema) Deprecated() *OneOfSchema {
	s.deprecated = true
	return s
}

func (s *OneOfSchema) Nullable() *OneOfSchema {
	s.nullable = true
	return s
}

func (s *OneOfSchema) ValidateFn(fn func() []ValidationError) *OneOfSchema {
	s.validateFn = fn
	return s
}

func (s *OneOfSchema) IsRequired() bool {
	return s.required
}

func (s *OneOfSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *OneOfSchema) IsPresent() bool {
	// For simple oneOf, check if any schema is present
	if len(s.schemas) > 0 {
		for _, schema := range s.schemas {
			if schema.IsPresent() {
				return true
			}
		}
		return false
	}
	// For discriminated oneOf, check if active variant is set
	if s.discriminator != "" && s.activeVariant != nil {
		if variant, ok := s.variants[*s.activeVariant]; ok {
			return variant.Schema().IsPresent()
		}
	}
	return false
}

func (s *OneOfSchema) Validate() []ValidationError {
	if s.validateFn != nil {
		return s.validateFn()
	}

	// For simple oneOf (schemas list), validate exactly one is present
	if len(s.schemas) > 0 {
		var presentSchemas []Schema
		for _, schema := range s.schemas {
			if schema.IsPresent() {
				presentSchemas = append(presentSchemas, schema)
			}
		}

		if len(presentSchemas) == 0 {
			if s.required {
				return []ValidationError{{Code: "oneOf", Message: "exactly one option must be provided"}}
			}
			return nil
		}

		if len(presentSchemas) > 1 {
			return []ValidationError{{Code: "oneOf", Message: "only one option allowed, multiple provided"}}
		}

		// Validate the one that's present
		return presentSchemas[0].Validate()
	}

	// For discriminated oneOf, validate the active variant if set
	if s.discriminator != "" && len(s.variants) > 0 {
		if s.activeVariant == nil {
			if s.required {
				return []ValidationError{{Code: "oneOf", Message: "discriminator value not set"}}
			}
			return nil
		}

		variant, ok := s.variants[*s.activeVariant]
		if !ok {
			return []ValidationError{{
				Code:    "oneOf",
				Message: fmt.Sprintf("unknown %s value: %q", s.discriminator, *s.activeVariant),
			}}
		}

		// Validate the active variant's schema
		return variant.Schema().Validate()
	}

	return nil
}

func (s *OneOfSchema) OpenAPI() map[string]any {
	var schema map[string]any

	// Simple oneOf (without discriminator)
	if len(s.schemas) > 0 {
		oneOf := make([]map[string]any, 0, len(s.schemas))
		for _, sch := range s.schemas {
			oneOf = append(oneOf, sch.OpenAPI())
		}
		schema = map[string]any{"oneOf": oneOf}
	} else {
		// Discriminated oneOf with inline schemas
		oneOf := make([]map[string]any, 0, len(s.variants))

		for _, variant := range s.variants {
			variantSchema := variant.Schema().OpenAPI()
			oneOf = append(oneOf, variantSchema)
		}

		// Note: mapping is omitted when schemas are inline (not $ref).
		// OpenAPI tooling can match variants by the discriminator property's
		// enum/const value in each inline schema.
		schema = map[string]any{
			"oneOf": oneOf,
			"discriminator": map[string]any{
				"propertyName": s.discriminator,
			},
		}
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

	return schema
}

// --- AnyOf Schema ---

type AnyOfSchema struct {
	schemas     []Schema
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
}

func AnyOf(schemas ...Schema) *AnyOfSchema {
	return &AnyOfSchema{schemas: schemas}
}

func (s *AnyOfSchema) Required() *AnyOfSchema {
	s.required = true
	return s
}

func (s *AnyOfSchema) Optional() *AnyOfSchema {
	s.required = false
	return s
}

func (s *AnyOfSchema) Example(val any) *AnyOfSchema {
	s.example = val
	return s
}

func (s *AnyOfSchema) Title(val string) *AnyOfSchema {
	s.title = val
	return s
}

func (s *AnyOfSchema) Description(val string) *AnyOfSchema {
	s.description = val
	return s
}

func (s *AnyOfSchema) Deprecated() *AnyOfSchema {
	s.deprecated = true
	return s
}

func (s *AnyOfSchema) Nullable() *AnyOfSchema {
	s.nullable = true
	return s
}

func (s *AnyOfSchema) IsRequired() bool {
	return s.required
}

func (s *AnyOfSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *AnyOfSchema) IsPresent() bool {
	for _, schema := range s.schemas {
		if schema.IsPresent() {
			return true
		}
	}
	return false
}

func (s *AnyOfSchema) Validate() []ValidationError {
	// Check if at least one schema is present
	var presentSchemas []Schema
	for _, schema := range s.schemas {
		if schema.IsPresent() {
			presentSchemas = append(presentSchemas, schema)
		}
	}

	if len(presentSchemas) == 0 {
		if s.required {
			return []ValidationError{{Code: "anyOf", Message: "at least one option must be provided"}}
		}
		return nil
	}

	// Validate all that are present
	var errs []ValidationError
	for _, schema := range presentSchemas {
		errs = append(errs, schema.Validate()...)
	}
	return errs
}

func (s *AnyOfSchema) OpenAPI() map[string]any {
	anyOf := make([]map[string]any, 0, len(s.schemas))
	for _, schema := range s.schemas {
		anyOf = append(anyOf, schema.OpenAPI())
	}

	result := map[string]any{"anyOf": anyOf}

	if s.example != nil {
		result["example"] = s.example
	}
	if s.title != "" {
		result["title"] = s.title
	}
	if s.description != "" {
		result["description"] = s.description
	}
	if s.deprecated {
		result["deprecated"] = true
	}
	if s.nullable {
		result["nullable"] = true
	}

	return result
}

// --- AllOf Schema ---

type AllOfSchema struct {
	schemas     []Schema
	required    bool
	example     any
	title       string
	description string
	deprecated  bool
	nullable    bool
}

func AllOf(schemas ...Schema) *AllOfSchema {
	return &AllOfSchema{schemas: schemas}
}

func (s *AllOfSchema) Required() *AllOfSchema {
	s.required = true
	return s
}

func (s *AllOfSchema) Optional() *AllOfSchema {
	s.required = false
	return s
}

func (s *AllOfSchema) Example(val any) *AllOfSchema {
	s.example = val
	return s
}

func (s *AllOfSchema) Title(val string) *AllOfSchema {
	s.title = val
	return s
}

func (s *AllOfSchema) Description(val string) *AllOfSchema {
	s.description = val
	return s
}

func (s *AllOfSchema) Deprecated() *AllOfSchema {
	s.deprecated = true
	return s
}

func (s *AllOfSchema) Nullable() *AllOfSchema {
	s.nullable = true
	return s
}

func (s *AllOfSchema) IsRequired() bool {
	return s.required
}

func (s *AllOfSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *AllOfSchema) IsPresent() bool {
	// AllOf is present if any of its schemas is present
	for _, schema := range s.schemas {
		if schema.IsPresent() {
			return true
		}
	}
	return false
}

func (s *AllOfSchema) Validate() []ValidationError {
	var errs []ValidationError
	for _, schema := range s.schemas {
		errs = append(errs, schema.Validate()...)
	}
	return errs
}

func (s *AllOfSchema) OpenAPI() map[string]any {
	allOf := make([]map[string]any, 0, len(s.schemas))
	for _, schema := range s.schemas {
		allOf = append(allOf, schema.OpenAPI())
	}

	result := map[string]any{"allOf": allOf}

	if s.example != nil {
		result["example"] = s.example
	}
	if s.title != "" {
		result["title"] = s.title
	}
	if s.description != "" {
		result["description"] = s.description
	}
	if s.deprecated {
		result["deprecated"] = true
	}
	if s.nullable {
		result["nullable"] = true
	}

	return result
}

// --- Ref Schema (for referencing other schemas) ---

type RefSchema struct {
	ref         string
	required    bool
	description string
}

func Ref(ref string) *RefSchema {
	return &RefSchema{ref: ref}
}

func (s *RefSchema) Required() *RefSchema {
	s.required = true
	return s
}

func (s *RefSchema) Optional() *RefSchema {
	s.required = false
	return s
}

func (s *RefSchema) Description(val string) *RefSchema {
	s.description = val
	return s
}

func (s *RefSchema) IsRequired() bool {
	return s.required
}

func (s *RefSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *RefSchema) IsPresent() bool {
	// Ref schemas don't have bound values, always return false
	return false
}

func (s *RefSchema) Validate() []ValidationError {
	return nil
}

func (s *RefSchema) OpenAPI() map[string]any {
	schema := map[string]any{"$ref": s.ref}
	if s.description != "" {
		schema["description"] = s.description
	}
	return schema
}

// --- Const Schema (for fixed values) ---

type ConstSchema struct {
	value       any
	required    bool
	title       string
	description string
}

func Const(value any) *ConstSchema {
	return &ConstSchema{value: value}
}

func (s *ConstSchema) Required() *ConstSchema {
	s.required = true
	return s
}

func (s *ConstSchema) Optional() *ConstSchema {
	s.required = false
	return s
}

func (s *ConstSchema) Title(val string) *ConstSchema {
	s.title = val
	return s
}

func (s *ConstSchema) Description(val string) *ConstSchema {
	s.description = val
	return s
}

func (s *ConstSchema) IsRequired() bool {
	return s.required
}

func (s *ConstSchema) GetSource() ParamSource {
	return SourceBody
}

func (s *ConstSchema) IsPresent() bool {
	// Const schemas have a fixed value, present if value is non-nil
	return s.value != nil
}

func (s *ConstSchema) Validate() []ValidationError {
	return nil
}

func (s *ConstSchema) OpenAPI() map[string]any {
	// Use enum with single value for OpenAPI 3.0.x compatibility
	// (const is only available in OpenAPI 3.1+)
	schema := map[string]any{
		"enum": []any{s.value},
	}
	switch s.value.(type) {
	case string:
		schema["type"] = "string"
	case int, int32, int64:
		schema["type"] = "integer"
	case float32, float64:
		schema["type"] = "number"
	case bool:
		schema["type"] = "boolean"
	}
	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	return schema
}
