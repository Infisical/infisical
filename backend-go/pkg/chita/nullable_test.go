package chita

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJsonNullable_UnmarshalJSON_Value(t *testing.T) {
	type Request struct {
		Name JsonNullable[string] `json:"name"`
	}

	data := []byte(`{"name": "John"}`)
	var req Request
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.True(t, req.Name.Present)
	assert.False(t, req.Name.Null)
	assert.Equal(t, "John", req.Name.Value)
	assert.True(t, req.Name.IsSet())
}

func TestJsonNullable_UnmarshalJSON_Null(t *testing.T) {
	type Request struct {
		Name JsonNullable[string] `json:"name"`
	}

	data := []byte(`{"name": null}`)
	var req Request
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.True(t, req.Name.Present)
	assert.True(t, req.Name.Null)
	assert.Equal(t, "", req.Name.Value) // zero value
	assert.False(t, req.Name.IsSet())
}

func TestJsonNullable_UnmarshalJSON_Absent(t *testing.T) {
	type Request struct {
		Name JsonNullable[string] `json:"name"`
	}

	data := []byte(`{}`)
	var req Request
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.False(t, req.Name.Present)
	assert.False(t, req.Name.Null)
	assert.Equal(t, "", req.Name.Value)
	assert.False(t, req.Name.IsSet())
}

func TestJsonNullable_UnmarshalJSON_ComplexType(t *testing.T) {
	type Address struct {
		Street string `json:"street"`
		City   string `json:"city"`
	}

	type Request struct {
		Address JsonNullable[Address] `json:"address"`
	}

	data := []byte(`{"address": {"street": "123 Main St", "city": "NYC"}}`)
	var req Request
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.True(t, req.Address.Present)
	assert.False(t, req.Address.Null)
	assert.Equal(t, "123 Main St", req.Address.Value.Street)
	assert.Equal(t, "NYC", req.Address.Value.City)
}

func TestJsonNullable_MarshalJSON_Value(t *testing.T) {
	val := Set("hello")
	data, err := json.Marshal(val)
	require.NoError(t, err)
	assert.Equal(t, `"hello"`, string(data))
}

func TestJsonNullable_MarshalJSON_Null(t *testing.T) {
	val := Null[string]()
	data, err := json.Marshal(val)
	require.NoError(t, err)
	assert.Equal(t, `null`, string(data))
}

func TestJsonNullable_MarshalJSON_Absent(t *testing.T) {
	val := Absent[string]()
	data, err := json.Marshal(val)
	require.NoError(t, err)
	assert.Equal(t, `null`, string(data)) // absent marshals as null
}

func TestJsonNullable_Ptr_Set(t *testing.T) {
	val := Set(42)
	ptr := val.Ptr()
	require.NotNil(t, ptr)
	assert.Equal(t, 42, *ptr)
}

func TestJsonNullable_Ptr_Null(t *testing.T) {
	val := Null[int]()
	ptr := val.Ptr()
	assert.Nil(t, ptr)
}

func TestJsonNullable_Ptr_Absent(t *testing.T) {
	val := Absent[int]()
	ptr := val.Ptr()
	assert.Nil(t, ptr)
}

func TestJsonNullable_WithSchema(t *testing.T) {
	type Request struct {
		Count JsonNullable[int] `json:"count"`
	}

	t.Run("value provided", func(t *testing.T) {
		data := []byte(`{"count": 0}`) // 0 is a valid value
		var req Request
		err := json.Unmarshal(data, &req)
		require.NoError(t, err)

		// Use Ptr() to get pointer for schema
		schema := Int(req.Count.Ptr()).Required()
		errs := schema.Validate()
		assert.Empty(t, errs) // 0 is valid
	})

	t.Run("value absent", func(t *testing.T) {
		data := []byte(`{}`)
		var req Request
		err := json.Unmarshal(data, &req)
		require.NoError(t, err)

		// Ptr() returns nil for absent
		schema := Int(req.Count.Ptr()).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "required", errs[0].Code)
	})

	t.Run("value null", func(t *testing.T) {
		data := []byte(`{"count": null}`)
		var req Request
		err := json.Unmarshal(data, &req)
		require.NoError(t, err)

		// Ptr() returns nil for null
		schema := Int(req.Count.Ptr()).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "required", errs[0].Code)
	})
}

func TestNullableSchema_TriState(t *testing.T) {
	type UpdateRequest struct {
		Name JsonNullable[string] `json:"name"`
	}

	t.Run("value present - valid", func(t *testing.T) {
		data := []byte(`{"name": "John"}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value).MinLength(1)).Required()
		errs := schema.Validate()
		assert.Empty(t, errs)
		assert.True(t, schema.IsPresent())
		assert.False(t, schema.IsNull())
		assert.False(t, schema.IsAbsent())
	})

	t.Run("value present - invalid pattern", func(t *testing.T) {
		data := []byte(`{"name": "invalid-email"}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value).Email()).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "format", errs[0].Code)
	})

	t.Run("value null - required fails", func(t *testing.T) {
		data := []byte(`{"name": null}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value)).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "required", errs[0].Code)
		assert.Contains(t, errs[0].Message, "null")
		assert.False(t, schema.IsPresent())
		assert.True(t, schema.IsNull())
	})

	t.Run("value null - optional ok", func(t *testing.T) {
		data := []byte(`{"name": null}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value)).Optional()
		errs := schema.Validate()
		assert.Empty(t, errs)
		assert.True(t, schema.IsNull())
	})

	t.Run("value absent - required fails", func(t *testing.T) {
		data := []byte(`{}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value)).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "required", errs[0].Code)
		assert.True(t, schema.IsAbsent())
	})

	t.Run("value absent - optional ok", func(t *testing.T) {
		data := []byte(`{}`)
		var req UpdateRequest
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Name, String(&req.Name.Value)).Optional()
		errs := schema.Validate()
		assert.Empty(t, errs)
		assert.True(t, schema.IsAbsent())
	})
}

func TestNullableSchema_OpenAPI(t *testing.T) {
	var name JsonNullable[string]
	schema := Nullable(&name, String(&name.Value).MinLength(1).MaxLength(100)).
		Description("User name").
		Example("John")

	openapi := schema.OpenAPI()

	assert.Equal(t, "string", openapi["type"])
	assert.Equal(t, true, openapi["nullable"])
	assert.Equal(t, 1, openapi["minLength"])
	assert.Equal(t, 100, openapi["maxLength"])
	assert.Equal(t, "User name", openapi["description"])
	assert.Equal(t, "John", openapi["example"])
}

func TestNullableSchema_IntType(t *testing.T) {
	type Request struct {
		Count JsonNullable[int] `json:"count"`
	}

	t.Run("zero is valid value", func(t *testing.T) {
		data := []byte(`{"count": 0}`)
		var req Request
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Count, Int(&req.Count.Value).Min(0)).Required()
		errs := schema.Validate()
		assert.Empty(t, errs)
		assert.True(t, schema.IsPresent())
	})

	t.Run("negative fails min", func(t *testing.T) {
		data := []byte(`{"count": -5}`)
		var req Request
		require.NoError(t, json.Unmarshal(data, &req))

		schema := Nullable(&req.Count, Int(&req.Count.Value).Min(0)).Required()
		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "minimum", errs[0].Code)
	})
}
