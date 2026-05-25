package chita

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Object Schema Tests ---

func TestObjectSchema_Validate(t *testing.T) {
	var name string
	var age *int

	schema := Object(map[string]Schema{
		"name": String(&name).Required().MinLength(1),
		"age":  Int(age).Required().Min(0), // nil pointer = missing
	})

	// Both fields missing - should have 2 errors
	errs := schema.Validate()
	require.Len(t, errs, 2)

	// Set valid values
	name = "John"
	ageVal := 25
	age = &ageVal
	// Rebuild schema with new pointer
	schema = Object(map[string]Schema{
		"name": String(&name).Required().MinLength(1),
		"age":  Int(age).Required().Min(0),
	})
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestObjectSchema_NestedValidation(t *testing.T) {
	var street string
	var city string

	schema := Object(map[string]Schema{
		"address": Object(map[string]Schema{
			"street": String(&street).Required(),
			"city":   String(&city).Required(),
		}),
	})

	errs := schema.Validate()
	require.Len(t, errs, 2)

	street = "123 Main St"
	city = "NYC"
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestObjectSchema_NestedFieldPaths(t *testing.T) {
	// Issue #6: Nested validation error paths should be properly constructed
	var email string

	schema := Object(map[string]Schema{
		"user": Object(map[string]Schema{
			"profile": Object(map[string]Schema{
				"email": String(&email).Required().Email(),
			}),
		}),
	})

	// Empty email should produce error with full path
	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "user.profile.email", errs[0].Field)
	assert.Equal(t, "required", errs[0].Code)

	// Invalid email should produce error with full path
	email = "not-an-email"
	errs = schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "user.profile.email", errs[0].Field)
	assert.Equal(t, "format", errs[0].Code)
}

func TestObjectSchema_NestedFieldPaths_MultipleErrors(t *testing.T) {
	var name string

	schema := Object(map[string]Schema{
		"data": Object(map[string]Schema{
			"name": String(&name).Required(),
			"age":  Int(nil).Required(), // nil pointer = missing
		}),
	})

	errs := schema.Validate()
	require.Len(t, errs, 2)

	// Check both errors have correct paths
	paths := make(map[string]bool)
	for _, e := range errs {
		paths[e.Field] = true
	}
	assert.True(t, paths["data.name"], "expected error for data.name")
	assert.True(t, paths["data.age"], "expected error for data.age")
}

func TestObjectSchema_OpenAPI(t *testing.T) {
	var name string
	var email string

	schema := Object(map[string]Schema{
		"name":  String(&name).Required().MinLength(1),
		"email": String(&email).Required().Email(),
	}).Title("User").Description("A user object").AdditionalProperties(false)

	openapi := schema.OpenAPI()

	assert.Equal(t, "object", openapi["type"])
	assert.Equal(t, "User", openapi["title"])
	assert.Equal(t, "A user object", openapi["description"])
	assert.Equal(t, false, openapi["additionalProperties"])

	props := openapi["properties"].(map[string]any)
	assert.Contains(t, props, "name")
	assert.Contains(t, props, "email")

	required := openapi["required"].([]string)
	assert.Contains(t, required, "name")
	assert.Contains(t, required, "email")
}

func TestObjectSchema_MinMaxProperties(t *testing.T) {
	schema := Object(nil).MinProperties(1).MaxProperties(10)

	openapi := schema.OpenAPI()

	assert.Equal(t, 1, openapi["minProperties"])
	assert.Equal(t, 10, openapi["maxProperties"])
}

func TestObjectSchema_Discriminator(t *testing.T) {
	schema := Object(nil).Discriminator("type", map[string]string{
		"dog": "#/components/schemas/Dog",
		"cat": "#/components/schemas/Cat",
	})

	openapi := schema.OpenAPI()

	disc := openapi["discriminator"].(map[string]any)
	assert.Equal(t, "type", disc["propertyName"])
	mapping := disc["mapping"].(map[string]string)
	assert.Equal(t, "#/components/schemas/Dog", mapping["dog"])
	assert.Equal(t, "#/components/schemas/Cat", mapping["cat"])
}

// --- Array Schema Tests ---

func TestArraySchema_OpenAPI(t *testing.T) {
	var itemVal string
	itemSchema := String(&itemVal)

	schema := Array(itemSchema).
		MinItems(1).
		MaxItems(100).
		UniqueItems().
		Title("Tags").
		Description("List of tags")

	openapi := schema.OpenAPI()

	assert.Equal(t, "array", openapi["type"])
	assert.Equal(t, 1, openapi["minItems"])
	assert.Equal(t, 100, openapi["maxItems"])
	assert.Equal(t, true, openapi["uniqueItems"])
	assert.Equal(t, "Tags", openapi["title"])
	assert.Equal(t, "List of tags", openapi["description"])

	items := openapi["items"].(map[string]any)
	assert.Equal(t, "string", items["type"])
}

func TestArraySchema_ValidateFn(t *testing.T) {
	called := false
	schema := Array(nil).ValidateFn(func() []ValidationError {
		called = true
		return []ValidationError{{Code: "custom", Message: "custom error"}}
	})

	errs := schema.Validate()
	assert.True(t, called)
	require.Len(t, errs, 1)
	assert.Equal(t, "custom", errs[0].Code)
}

func TestArraySchema_Required(t *testing.T) {
	schema := Array(nil).Required()
	assert.True(t, schema.IsRequired())

	schema = Array(nil).Optional()
	assert.False(t, schema.IsRequired())
}

// --- Map Schema Tests ---

func TestMapSchema_OpenAPI(t *testing.T) {
	var val string
	valueSchema := String(&val)

	schema := Map(valueSchema).
		MinProperties(1).
		MaxProperties(50).
		Title("Metadata").
		Description("Key-value metadata")

	openapi := schema.OpenAPI()

	assert.Equal(t, "object", openapi["type"])
	assert.Equal(t, 1, openapi["minProperties"])
	assert.Equal(t, 50, openapi["maxProperties"])
	assert.Equal(t, "Metadata", openapi["title"])

	additionalProps := openapi["additionalProperties"].(map[string]any)
	assert.Equal(t, "string", additionalProps["type"])
}

func TestMapSchema_ValidateFn(t *testing.T) {
	schema := Map(nil).ValidateFn(func() []ValidationError {
		return []ValidationError{{Code: "custom", Message: "custom error"}}
	})

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "custom", errs[0].Code)
}

// --- OneOf Schema Tests ---

type testDogSchema struct {
	Breed string
}

func (d *testDogSchema) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  Const("dog"), // discriminator - OpenAPI only, not validated
		"breed": String(&d.Breed).Required(),
	})
}

type testCatSchema struct {
	Color string
}

func (c *testCatSchema) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  Const("cat"), // discriminator - OpenAPI only, not validated
		"color": String(&c.Color).Required(),
	})
}

func TestOneOfSchema_OpenAPI(t *testing.T) {
	schema := OneOf("type", map[string]SchemaProvider{
		"dog": &testDogSchema{},
		"cat": &testCatSchema{},
	}).Title("Animal").Description("Either a dog or cat")

	openapi := schema.OpenAPI()

	assert.NotNil(t, openapi["oneOf"])
	assert.Equal(t, "Animal", openapi["title"])
	assert.Equal(t, "Either a dog or cat", openapi["description"])

	disc := openapi["discriminator"].(map[string]any)
	assert.Equal(t, "type", disc["propertyName"])
}

func TestOneOfSchema_ValidateFn(t *testing.T) {
	schema := OneOf("type", nil).ValidateFn(func() []ValidationError {
		return []ValidationError{{Code: "union", Message: "invalid variant"}}
	})

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "union", errs[0].Code)
}

func TestOneOfSchema_DiscriminatedValidation(t *testing.T) {
	dog := &testDogSchema{Breed: "Labrador"}
	cat := &testCatSchema{} // Color not set - will fail validation

	t.Run("validates active variant - valid", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).SetActiveVariant("dog")

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("validates active variant - invalid", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).SetActiveVariant("cat")

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "color", errs[0].Field)
	})

	t.Run("unknown variant", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).SetActiveVariant("bird")

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "oneOf", errs[0].Code)
		assert.Contains(t, errs[0].Message, "bird")
	})

	t.Run("no active variant - required", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).Required()

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "oneOf", errs[0].Code)
	})

	t.Run("no active variant - optional", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).Optional()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})
}

func TestOneOfSchema_DiscriminatedIsPresent(t *testing.T) {
	dog := &testDogSchema{Breed: "Labrador"}
	cat := &testCatSchema{}

	t.Run("present when active variant set and has values", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		}).SetActiveVariant("dog")

		assert.True(t, schema.IsPresent())
	})

	t.Run("not present when no active variant", func(t *testing.T) {
		schema := OneOf("type", map[string]SchemaProvider{
			"dog": dog,
			"cat": cat,
		})

		assert.False(t, schema.IsPresent())
	})
}

// --- AnyOf Schema Tests ---

func TestAnyOfSchema_OpenAPI(t *testing.T) {
	var strVal string
	var intVal int

	schema := AnyOf(
		String(&strVal),
		Int(&intVal),
	).Title("StringOrInt").Description("Can be string or integer")

	openapi := schema.OpenAPI()

	anyOf := openapi["anyOf"].([]map[string]any)
	require.Len(t, anyOf, 2)
	assert.Equal(t, "string", anyOf[0]["type"])
	assert.Equal(t, "integer", anyOf[1]["type"])
	assert.Equal(t, "StringOrInt", openapi["title"])
}

func TestAnyOfSchema_Required(t *testing.T) {
	schema := AnyOf().Required()
	assert.True(t, schema.IsRequired())

	schema = AnyOf().Optional()
	assert.False(t, schema.IsRequired())
}

// --- AllOf Schema Tests ---

func TestAllOfSchema_OpenAPI(t *testing.T) {
	var name string
	var age int

	schema := AllOf(
		Object(map[string]Schema{"name": String(&name)}),
		Object(map[string]Schema{"age": Int(&age)}),
	).Title("Combined").Description("Combined schema")

	openapi := schema.OpenAPI()

	allOf := openapi["allOf"].([]map[string]any)
	require.Len(t, allOf, 2)
	assert.Equal(t, "Combined", openapi["title"])
}

func TestAllOfSchema_Validate(t *testing.T) {
	var name string
	var age *int

	schema := AllOf(
		Object(map[string]Schema{"name": String(&name).Required()}),
		Object(map[string]Schema{"age": Int(age).Required()}), // nil pointer = missing
	)

	errs := schema.Validate()
	require.Len(t, errs, 2)

	name = "John"
	ageVal := 25
	age = &ageVal
	// Rebuild schema with new pointer
	schema = AllOf(
		Object(map[string]Schema{"name": String(&name).Required()}),
		Object(map[string]Schema{"age": Int(age).Required()}),
	)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

// --- Ref Schema Tests ---

func TestRefSchema_OpenAPI(t *testing.T) {
	schema := Ref("#/components/schemas/User").
		Required().
		Description("Reference to User schema")

	openapi := schema.OpenAPI()

	assert.Equal(t, "#/components/schemas/User", openapi["$ref"])
	assert.Equal(t, "Reference to User schema", openapi["description"])
}

func TestRefSchema_Required(t *testing.T) {
	schema := Ref("#/components/schemas/User").Required()
	assert.True(t, schema.IsRequired())

	schema = Ref("#/components/schemas/User").Optional()
	assert.False(t, schema.IsRequired())
}

func TestRefSchema_Validate(t *testing.T) {
	schema := Ref("#/components/schemas/User")
	errs := schema.Validate()
	assert.Empty(t, errs)
}

// --- Const Schema Tests ---

func TestConstSchema_OpenAPI(t *testing.T) {
	schema := Const("fixed_value").
		Title("Constant").
		Description("A constant value")

	openapi := schema.OpenAPI()

	// Uses enum with single value for OpenAPI 3.0.x compatibility
	assert.Equal(t, []any{"fixed_value"}, openapi["enum"])
	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, "Constant", openapi["title"])
	assert.Equal(t, "A constant value", openapi["description"])
}

func TestConstSchema_Required(t *testing.T) {
	schema := Const("value").Required()
	assert.True(t, schema.IsRequired())

	schema = Const("value").Optional()
	assert.False(t, schema.IsRequired())
}

func TestConstSchema_Validate(t *testing.T) {
	schema := Const("value")
	errs := schema.Validate()
	assert.Empty(t, errs)
}

// --- Nullable and other modifiers ---

func TestObjectSchema_Modifiers(t *testing.T) {
	schema := Object(nil).
		Nullable().
		ReadOnly().
		WriteOnly().
		Deprecated().
		Example(map[string]any{"key": "value"})

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["readOnly"])
	assert.Equal(t, true, openapi["writeOnly"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.NotNil(t, openapi["example"])
}

func TestArraySchema_Modifiers(t *testing.T) {
	schema := Array(nil).
		Nullable().
		ReadOnly().
		WriteOnly().
		Deprecated().
		Example([]string{"a", "b"})

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["readOnly"])
	assert.Equal(t, true, openapi["writeOnly"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.NotNil(t, openapi["example"])
}

func TestMapSchema_Modifiers(t *testing.T) {
	schema := Map(nil).
		Nullable().
		ReadOnly().
		WriteOnly().
		Deprecated().
		Example(map[string]string{"a": "b"})

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["readOnly"])
	assert.Equal(t, true, openapi["writeOnly"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.NotNil(t, openapi["example"])
}

func TestOneOfSchema_Modifiers(t *testing.T) {
	schema := OneOf("type", nil).
		Nullable().
		Deprecated().
		Example(map[string]any{"type": "dog"})

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.NotNil(t, openapi["example"])
}

func TestAnyOfSchema_Modifiers(t *testing.T) {
	schema := AnyOf().
		Nullable().
		Deprecated()

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["deprecated"])
}

func TestAllOfSchema_Modifiers(t *testing.T) {
	schema := AllOf().
		Nullable().
		Deprecated()

	openapi := schema.OpenAPI()

	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["deprecated"])
}
