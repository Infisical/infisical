package api

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// --- IsPresent Tests for Primitive Types ---

func TestStringSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := String(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("empty string", func(t *testing.T) {
		val := ""
		schema := String(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("non-empty string", func(t *testing.T) {
		val := "hello"
		schema := String(&val)
		assert.True(t, schema.IsPresent())
	})

	t.Run("whitespace string", func(t *testing.T) {
		val := "   "
		schema := String(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestIntSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Int(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("zero value", func(t *testing.T) {
		val := 0
		schema := Int(&val)
		assert.True(t, schema.IsPresent()) // Zero is still present
	})

	t.Run("non-zero value", func(t *testing.T) {
		val := 42
		schema := Int(&val)
		assert.True(t, schema.IsPresent())
	})

	t.Run("negative value", func(t *testing.T) {
		val := -10
		schema := Int(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestFloatSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Float(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("zero value", func(t *testing.T) {
		val := 0.0
		schema := Float(&val)
		assert.True(t, schema.IsPresent())
	})

	t.Run("non-zero value", func(t *testing.T) {
		val := 3.14
		schema := Float(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestBoolSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Bool(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("false value", func(t *testing.T) {
		val := false
		schema := Bool(&val)
		assert.True(t, schema.IsPresent()) // false is still present
	})

	t.Run("true value", func(t *testing.T) {
		val := true
		schema := Bool(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestUUIDSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := UUID(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("nil UUID", func(t *testing.T) {
		val := uuid.Nil
		schema := UUID(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("valid UUID", func(t *testing.T) {
		val := uuid.New()
		schema := UUID(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestTimeSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Time(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("zero time", func(t *testing.T) {
		val := time.Time{}
		schema := Time(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("valid time", func(t *testing.T) {
		val := time.Now()
		schema := Time(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestBytesSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Bytes(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("empty bytes", func(t *testing.T) {
		val := []byte{}
		schema := Bytes(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("non-empty bytes", func(t *testing.T) {
		val := []byte{1, 2, 3}
		schema := Bytes(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestAnySchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Any(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("nil value", func(t *testing.T) {
		var val any
		schema := Any(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("non-nil value", func(t *testing.T) {
		var val any = "hello"
		schema := Any(&val)
		assert.True(t, schema.IsPresent())
	})
}

func TestRawSchema_IsPresent(t *testing.T) {
	t.Run("nil pointer", func(t *testing.T) {
		schema := Raw(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("empty raw", func(t *testing.T) {
		val := json.RawMessage{}
		schema := Raw(&val)
		assert.False(t, schema.IsPresent())
	})

	t.Run("non-empty raw", func(t *testing.T) {
		val := json.RawMessage(`{"foo": "bar"}`)
		schema := Raw(&val)
		assert.True(t, schema.IsPresent())
	})
}

// --- IsPresent Tests for Composite Types ---

func TestObjectSchema_IsPresent(t *testing.T) {
	t.Run("no properties present", func(t *testing.T) {
		name := ""
		schema := Object(map[string]Schema{
			"name": String(&name),
		})
		// name is empty string = not present for string
		assert.False(t, schema.IsPresent())
	})

	t.Run("one property present", func(t *testing.T) {
		name := "John"
		schema := Object(map[string]Schema{
			"name": String(&name),
		})
		assert.True(t, schema.IsPresent())
	})

	t.Run("multiple properties some present", func(t *testing.T) {
		name := ""
		age := 25
		schema := Object(map[string]Schema{
			"name": String(&name),
			"age":  Int(&age),
		})
		assert.True(t, schema.IsPresent()) // age is present
	})
}

func TestArraySchema_IsPresent(t *testing.T) {
	t.Run("no isPresentFn", func(t *testing.T) {
		schema := Array(String(new(string)))
		assert.False(t, schema.IsPresent()) // Default is false
	})

	t.Run("with isPresentFn returning false", func(t *testing.T) {
		items := []string{}
		schema := Array(String(new(string))).IsPresentFn(func() bool {
			return len(items) > 0
		})
		assert.False(t, schema.IsPresent())
	})

	t.Run("with isPresentFn returning true", func(t *testing.T) {
		items := []string{"a", "b"}
		schema := Array(String(new(string))).IsPresentFn(func() bool {
			return len(items) > 0
		})
		assert.True(t, schema.IsPresent())
	})
}

func TestMapSchema_IsPresent(t *testing.T) {
	t.Run("no isPresentFn", func(t *testing.T) {
		schema := Map(String(new(string)))
		assert.False(t, schema.IsPresent())
	})

	t.Run("with isPresentFn returning true", func(t *testing.T) {
		m := map[string]string{"key": "value"}
		schema := Map(String(new(string))).IsPresentFn(func() bool {
			return len(m) > 0
		})
		assert.True(t, schema.IsPresent())
	})
}

func TestOneOfSchema_IsPresent(t *testing.T) {
	t.Run("no schema present", func(t *testing.T) {
		strVal := ""
		intVal := 0
		schema := OneOfSchemas(
			String(&strVal),
		)
		assert.False(t, schema.IsPresent())
		_ = intVal
	})

	t.Run("one schema present", func(t *testing.T) {
		strVal := "hello"
		schema := OneOfSchemas(
			String(&strVal),
		)
		assert.True(t, schema.IsPresent())
	})
}

func TestAnyOfSchema_IsPresent(t *testing.T) {
	t.Run("no schema present", func(t *testing.T) {
		strVal := ""
		schema := AnyOf(
			String(&strVal),
		)
		assert.False(t, schema.IsPresent())
	})

	t.Run("one schema present", func(t *testing.T) {
		strVal := "hello"
		schema := AnyOf(
			String(&strVal),
		)
		assert.True(t, schema.IsPresent())
	})

	t.Run("multiple schemas present", func(t *testing.T) {
		strVal := "hello"
		intVal := 42
		schema := AnyOf(
			String(&strVal),
			Int(&intVal),
		)
		assert.True(t, schema.IsPresent())
	})
}

func TestAllOfSchema_IsPresent(t *testing.T) {
	t.Run("no schema present", func(t *testing.T) {
		strVal := ""
		schema := AllOf(
			String(&strVal),
		)
		assert.False(t, schema.IsPresent())
	})

	t.Run("any schema present", func(t *testing.T) {
		strVal := "hello"
		schema := AllOf(
			String(&strVal),
		)
		assert.True(t, schema.IsPresent())
	})
}

func TestRefSchema_IsPresent(t *testing.T) {
	schema := Ref("#/components/schemas/User")
	assert.False(t, schema.IsPresent()) // Ref has no bound value
}

func TestConstSchema_IsPresent(t *testing.T) {
	t.Run("nil value", func(t *testing.T) {
		schema := Const(nil)
		assert.False(t, schema.IsPresent())
	})

	t.Run("non-nil value", func(t *testing.T) {
		schema := Const("fixed")
		assert.True(t, schema.IsPresent())
	})
}
