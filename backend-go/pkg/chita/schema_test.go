package chita

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- String Schema Tests ---

func TestStringSchema_Required(t *testing.T) {
	var val Required[string]
	schema := Str(&val)

	assert.True(t, schema.IsRequired())

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestStringSchema_Optional(t *testing.T) {
	var val Optional[string]
	schema := OptStr(&val)

	assert.False(t, schema.IsRequired())

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_MinLength(t *testing.T) {
	val := NewRequired("ab")
	schema := Str(&val).MinLength(3)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "min_length", errs[0].Code)

	val.Set("abc")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_MaxLength(t *testing.T) {
	val := NewRequired("abcdef")
	schema := Str(&val).MaxLength(5)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "max_length", errs[0].Code)

	val.Set("abcde")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_Length(t *testing.T) {
	val := NewRequired("ab")
	schema := Str(&val).Length(3, 5)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "min_length", errs[0].Code)

	val.Set("abcdef")
	errs = schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "max_length", errs[0].Code)

	val.Set("abcd")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_Pattern(t *testing.T) {
	val := NewRequired("abc123")
	schema := Str(&val).Pattern(`^[a-z]+$`)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "pattern", errs[0].Code)

	val.Set("abc")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_Enum(t *testing.T) {
	val := NewRequired("invalid")
	schema := Str(&val).Enum("foo", "bar", "baz")

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "enum", errs[0].Code)

	val.Set("bar")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_FormatEmail(t *testing.T) {
	val := NewRequired("not-an-email")
	schema := Str(&val).Email()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code)

	val.Set("test@example.com")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_FormatUUID(t *testing.T) {
	val := NewRequired("not-a-uuid")
	schema := Str(&val).UUID()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code)

	val.Set("550e8400-e29b-41d4-a716-446655440000")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_FormatURI(t *testing.T) {
	val := NewRequired("not a uri")
	schema := Str(&val).URI()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code)

	val.Set("https://example.com/path")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_FormatDateTime(t *testing.T) {
	val := NewRequired("not-a-date")
	schema := Str(&val).DateTime()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code)

	val.Set("2024-01-15T10:30:00Z")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_FormatDate(t *testing.T) {
	val := NewRequired("not-a-date")
	schema := Str(&val).Date()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code)

	val.Set("2024-01-15")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestStringSchema_OpenAPI(t *testing.T) {
	var val Required[string]
	schema := Str(&val).
		MinLength(1).
		MaxLength(100).
		Pattern(`^[a-z]+$`).
		Format("custom").
		Default("default").
		Example("example").
		Title("Title").
		Description("Description").
		Deprecated().
		Nullable().
		ReadOnly()

	openapi := schema.OpenAPI()

	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, 1, openapi["minLength"])
	assert.Equal(t, 100, openapi["maxLength"])
	assert.Equal(t, `^[a-z]+$`, openapi["pattern"])
	assert.Equal(t, "custom", openapi["format"])
	assert.Equal(t, "default", openapi["default"])
	assert.Equal(t, "example", openapi["example"])
	assert.Equal(t, "Title", openapi["title"])
	assert.Equal(t, "Description", openapi["description"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, true, openapi["readOnly"])
}

func TestStringSchema_OpenAPI_Enum(t *testing.T) {
	var val Required[string]
	schema := Str(&val).Enum("a", "b", "c")

	openapi := schema.OpenAPI()

	assert.Equal(t, []string{"a", "b", "c"}, openapi["enum"])
}

// --- Int Schema Tests ---

func TestIntSchema_Required_NotSet(t *testing.T) {
	var val Required[int]
	schema := Int(&val)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestIntSchema_Required_ZeroValue(t *testing.T) {
	// Zero is a valid provided value, not "missing"
	val := NewRequired(0)
	schema := Int(&val)

	errs := schema.Validate()
	assert.Empty(t, errs) // 0 is valid when isSet is true
}

func TestIntSchema_Required_NonZeroValue(t *testing.T) {
	val := NewRequired(42)
	schema := Int(&val)

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_Min(t *testing.T) {
	val := NewRequired(5)
	schema := Int(&val).Min(10)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "minimum", errs[0].Code)

	val.Set(10)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_Max(t *testing.T) {
	val := NewRequired(15)
	schema := Int(&val).Max(10)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "maximum", errs[0].Code)

	val.Set(10)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_Range(t *testing.T) {
	val := NewRequired(5)
	schema := Int(&val).Range(10, 20)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "minimum", errs[0].Code)

	val.Set(25)
	errs = schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "maximum", errs[0].Code)

	val.Set(15)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_ExclusiveMin(t *testing.T) {
	val := NewRequired(10)
	schema := Int(&val).ExclusiveMin(10)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "exclusive_minimum", errs[0].Code)

	val.Set(11)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_ExclusiveMax(t *testing.T) {
	val := NewRequired(10)
	schema := Int(&val).ExclusiveMax(10)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "exclusive_maximum", errs[0].Code)

	val.Set(9)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_MultipleOf(t *testing.T) {
	val := NewRequired(7)
	schema := Int(&val).MultipleOf(3)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "multiple_of", errs[0].Code)

	val.Set(9)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestIntSchema_Enum(t *testing.T) {
	val := NewRequired(5)
	schema := Int(&val).Enum(1, 2, 3)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "enum", errs[0].Code)

	val.Set(2)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestInt64Schema(t *testing.T) {
	val := NewRequired[int64](100)
	schema := Int64(&val).Min(50).Max(200)

	errs := schema.Validate()
	assert.Empty(t, errs)

	openapi := schema.OpenAPI()
	assert.Equal(t, "integer", openapi["type"])
	assert.Equal(t, "int64", openapi["format"])
}

func TestIntSchema_OpenAPI(t *testing.T) {
	var val Required[int]
	schema := Int(&val).
		Min(0).
		Max(100).
		MultipleOf(5).
		Default(50).
		Example(25).
		Title("Count").
		Description("A count value").
		Deprecated().
		Nullable()

	openapi := schema.OpenAPI()

	assert.Equal(t, "integer", openapi["type"])
	assert.Equal(t, "int64", openapi["format"])
	assert.Equal(t, int64(0), openapi["minimum"])
	assert.Equal(t, int64(100), openapi["maximum"])
	assert.Equal(t, int64(5), openapi["multipleOf"])
	assert.Equal(t, int64(50), openapi["default"])
	assert.Equal(t, 25, openapi["example"])
	assert.Equal(t, "Count", openapi["title"])
	assert.Equal(t, "A count value", openapi["description"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.Equal(t, true, openapi["nullable"])
}

// --- Float Schema Tests ---

func TestFloatSchema_Required_NotSet(t *testing.T) {
	var val Required[float64]
	schema := Float(&val)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestFloatSchema_Required_ZeroValue(t *testing.T) {
	// Zero is a valid provided value, not "missing"
	val := NewRequired(0.0)
	schema := Float(&val)

	errs := schema.Validate()
	assert.Empty(t, errs) // 0.0 is valid when isSet is true
}

func TestFloatSchema_Required_NonZeroValue(t *testing.T) {
	val := NewRequired(3.14)
	schema := Float(&val)

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestFloatSchema_Min(t *testing.T) {
	val := NewRequired(1.5)
	schema := Float(&val).Min(2.0)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "minimum", errs[0].Code)

	val.Set(2.5)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestFloatSchema_Max(t *testing.T) {
	val := NewRequired(5.5)
	schema := Float(&val).Max(5.0)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "maximum", errs[0].Code)

	val.Set(4.5)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestFloatSchema_Range(t *testing.T) {
	val := NewRequired(0.5)
	schema := Float(&val).Range(1.0, 10.0)

	errs := schema.Validate()
	require.Len(t, errs, 1)

	val.Set(5.0)
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestFloatSchema_ExclusiveMinMax(t *testing.T) {
	val := NewRequired(5.0)
	schema := Float(&val).ExclusiveMin(5.0)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "exclusive_minimum", errs[0].Code)

	schema = Float(&val).ExclusiveMax(5.0)
	errs = schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "exclusive_maximum", errs[0].Code)
}

func TestFloatSchema_OpenAPI(t *testing.T) {
	var val Required[float64]
	schema := Float(&val).Min(0.0).Max(1.0).Title("Ratio")

	openapi := schema.OpenAPI()

	assert.Equal(t, "number", openapi["type"])
	assert.Equal(t, "double", openapi["format"])
	assert.Equal(t, 0.0, openapi["minimum"])
	assert.Equal(t, 1.0, openapi["maximum"])
	assert.Equal(t, "Ratio", openapi["title"])
}

// --- Bool Schema Tests ---

func TestBoolSchema_Required_NotSet(t *testing.T) {
	var val Required[bool]
	schema := Bool(&val)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestBoolSchema_Required_FalseValue(t *testing.T) {
	// false is a valid provided value, not "missing"
	val := NewRequired(false)
	schema := Bool(&val)

	errs := schema.Validate()
	assert.Empty(t, errs) // false is valid when isSet is true
}

func TestBoolSchema_Required_TrueValue(t *testing.T) {
	val := NewRequired(true)
	schema := Bool(&val)

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestBoolSchema_OpenAPI(t *testing.T) {
	var val Required[bool]
	schema := Bool(&val).
		Default(true).
		Example(false).
		Title("Enabled").
		Description("Whether feature is enabled").
		Deprecated().
		Nullable()

	openapi := schema.OpenAPI()

	assert.Equal(t, "boolean", openapi["type"])
	assert.Equal(t, true, openapi["default"])
	assert.Equal(t, false, openapi["example"])
	assert.Equal(t, "Enabled", openapi["title"])
	assert.Equal(t, "Whether feature is enabled", openapi["description"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.Equal(t, true, openapi["nullable"])
}

// --- UUID Schema Tests ---

func TestUUIDSchema_Required(t *testing.T) {
	var val uuid.UUID
	schema := UUID(&val).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)

	val = uuid.New()
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestUUIDSchema_Optional(t *testing.T) {
	var val uuid.UUID
	schema := UUID(&val).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestUUIDSchema_OpenAPI(t *testing.T) {
	var val uuid.UUID
	schema := UUID(&val).Title("ID").Description("Unique identifier")

	openapi := schema.OpenAPI()

	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, "uuid", openapi["format"])
	assert.Equal(t, "ID", openapi["title"])
	assert.Equal(t, "Unique identifier", openapi["description"])
}

// --- Time Schema Tests ---

func TestTimeSchema_Required(t *testing.T) {
	var val time.Time
	schema := Time(&val).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)

	val = time.Now()
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestTimeSchema_Optional(t *testing.T) {
	var val time.Time
	schema := Time(&val).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestTimeSchema_OpenAPI(t *testing.T) {
	var val time.Time
	schema := Time(&val).Title("Created At")

	openapi := schema.OpenAPI()

	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, "date-time", openapi["format"])
	assert.Equal(t, "Created At", openapi["title"])
}

func TestTimeSchema_DateOnly(t *testing.T) {
	var val time.Time
	schema := Time(&val).DateOnly()

	openapi := schema.OpenAPI()

	assert.Equal(t, "date", openapi["format"])
}

func TestTimeSchema_TimeOnly(t *testing.T) {
	var val time.Time
	schema := Time(&val).TimeOnly()

	openapi := schema.OpenAPI()

	assert.Equal(t, "time", openapi["format"])
}

// --- Bytes Schema Tests ---

func TestBytesSchema_Required(t *testing.T) {
	var val []byte
	schema := Bytes(&val).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)

	val = []byte("data")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestBytesSchema_MinMaxLength(t *testing.T) {
	val := []byte("ab")
	schema := Bytes(&val).MinLength(3).MaxLength(10)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "min_length", errs[0].Code)

	val = []byte("abcdefghijk")
	errs = schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "max_length", errs[0].Code)

	val = []byte("abcde")
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestBytesSchema_OpenAPI(t *testing.T) {
	var val []byte
	schema := Bytes(&val).MinLength(1).MaxLength(1024)

	openapi := schema.OpenAPI()

	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, "byte", openapi["format"])
	assert.Equal(t, 1, openapi["minLength"])
	assert.Equal(t, 1024, openapi["maxLength"])
}

func TestBytesSchema_Binary(t *testing.T) {
	var val []byte
	schema := Bytes(&val).Binary()

	openapi := schema.OpenAPI()

	assert.Equal(t, "binary", openapi["format"])
}

// --- Any Schema Tests ---

func TestAnySchema_Required(t *testing.T) {
	var val any
	schema := Any(&val).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)

	val = map[string]any{"key": "value"}
	errs = schema.Validate()
	assert.Empty(t, errs)
}

func TestAnySchema_OpenAPI(t *testing.T) {
	var val any
	schema := Any(&val).Title("Data").Description("Arbitrary data")

	openapi := schema.OpenAPI()

	_, hasType := openapi["type"]
	assert.False(t, hasType)
	assert.Equal(t, "Data", openapi["title"])
	assert.Equal(t, "Arbitrary data", openapi["description"])
}

// --- Raw Schema Tests ---

func TestRawSchema_Required(t *testing.T) {
	var rawMessage json.RawMessage
	schema := Raw(&rawMessage).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestRawSchema_OpenAPI(t *testing.T) {
	var rawMessage json.RawMessage
	schema := Raw(&rawMessage).Title("Raw JSON")

	openapi := schema.OpenAPI()

	_, hasType := openapi["type"]
	assert.False(t, hasType)
	assert.Equal(t, "Raw JSON", openapi["title"])
}

// --- Multiple Validation Errors ---

func TestStringSchema_MultipleErrors(t *testing.T) {
	val := NewRequired("ab")
	schema := Str(&val).MinLength(5).Pattern(`^[0-9]+$`)

	errs := schema.Validate()
	require.Len(t, errs, 2)

	codes := make([]string, len(errs))
	for i, e := range errs {
		codes[i] = e.Code
	}
	assert.Contains(t, codes, "min_length")
	assert.Contains(t, codes, "pattern")
}

// --- ValidationErrors type ---

func TestValidationErrors_Error(t *testing.T) {
	errs := ValidationErrors{
		{Field: "name", Message: "is required", Code: "required"},
		{Field: "email", Message: "must be valid", Code: "format"},
	}

	errStr := errs.Error()
	assert.Contains(t, errStr, "name: is required")
	assert.Contains(t, errStr, "email: must be valid")
}

func TestValidationErrors_HasErrors(t *testing.T) {
	var errs ValidationErrors
	assert.False(t, errs.HasErrors())

	errs = append(errs, ValidationError{Message: "error"})
	assert.True(t, errs.HasErrors())
}

func TestValidationError_Error(t *testing.T) {
	err := ValidationError{Field: "name", Message: "is required"}
	assert.Equal(t, "name: is required", err.Error())

	err = ValidationError{Message: "something went wrong"}
	assert.Equal(t, "something went wrong", err.Error())
}
