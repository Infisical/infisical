package chita

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestSchema_IsPresent(t *testing.T) {
	validUUID := uuid.New()
	validTime := time.Now()

	tests := []struct {
		name        string
		build       func() Schema
		wantPresent bool
	}{
		// String
		{"string/nil", func() Schema { return String(nil) }, false},
		{"string/empty", func() Schema { v := ""; return String(&v) }, false},
		{"string/non-empty", func() Schema { v := "hello"; return String(&v) }, true},
		{"string/whitespace", func() Schema { v := "   "; return String(&v) }, true},

		// Int
		{"int/nil", func() Schema { return Int(nil) }, false},
		{"int/zero", func() Schema { v := 0; return Int(&v) }, true},
		{"int/non-zero", func() Schema { v := 42; return Int(&v) }, true},
		{"int/negative", func() Schema { v := -10; return Int(&v) }, true},

		// Float
		{"float/nil", func() Schema { return Float(nil) }, false},
		{"float/zero", func() Schema { v := 0.0; return Float(&v) }, true},
		{"float/non-zero", func() Schema { v := 3.14; return Float(&v) }, true},

		// Bool
		{"bool/nil", func() Schema { return Bool(nil) }, false},
		{"bool/false", func() Schema { v := false; return Bool(&v) }, true},
		{"bool/true", func() Schema { v := true; return Bool(&v) }, true},

		// UUID
		{"uuid/nil", func() Schema { return UUID(nil) }, false},
		{"uuid/zero", func() Schema { v := uuid.Nil; return UUID(&v) }, false},
		{"uuid/valid", func() Schema { return UUID(&validUUID) }, true},

		// Time
		{"time/nil", func() Schema { return Time(nil) }, false},
		{"time/zero", func() Schema { v := time.Time{}; return Time(&v) }, false},
		{"time/valid", func() Schema { return Time(&validTime) }, true},

		// Bytes
		{"bytes/nil", func() Schema { return Bytes(nil) }, false},
		{"bytes/empty", func() Schema { v := []byte{}; return Bytes(&v) }, false},
		{"bytes/non-empty", func() Schema { v := []byte{1, 2, 3}; return Bytes(&v) }, true},

		// Any
		{"any/nil-ptr", func() Schema { return Any(nil) }, false},
		{"any/nil-value", func() Schema { var v any; return Any(&v) }, false},
		{"any/non-nil", func() Schema { var v any = "hello"; return Any(&v) }, true},

		// Raw
		{"raw/nil", func() Schema { return Raw(nil) }, false},
		{"raw/empty", func() Schema { v := json.RawMessage{}; return Raw(&v) }, false},
		{"raw/non-empty", func() Schema { v := json.RawMessage(`{"foo":"bar"}`); return Raw(&v) }, true},

		// Const
		{"const/nil", func() Schema { return Const(nil) }, false},
		{"const/value", func() Schema { return Const("fixed") }, true},

		// Ref
		{"ref", func() Schema { return Ref("#/components/schemas/User") }, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := tt.build()
			assert.Equal(t, tt.wantPresent, schema.IsPresent())
		})
	}
}

func TestCompositeSchema_IsPresent(t *testing.T) {
	t.Run("object/none present", func(t *testing.T) {
		name := ""
		schema := Object(map[string]Schema{"name": String(&name)})
		assert.False(t, schema.IsPresent())
	})

	t.Run("object/one present", func(t *testing.T) {
		name := "John"
		schema := Object(map[string]Schema{"name": String(&name)})
		assert.True(t, schema.IsPresent())
	})

	t.Run("object/partial present", func(t *testing.T) {
		name := ""
		age := 25
		schema := Object(map[string]Schema{"name": String(&name), "age": Int(&age)})
		assert.True(t, schema.IsPresent())
	})

	t.Run("array/no fn", func(t *testing.T) {
		schema := Array(String(new(string)))
		assert.False(t, schema.IsPresent())
	})

	t.Run("array/empty", func(t *testing.T) {
		items := []string{}
		schema := Array(String(new(string))).IsPresentFn(func() bool { return len(items) > 0 })
		assert.False(t, schema.IsPresent())
	})

	t.Run("array/non-empty", func(t *testing.T) {
		items := []string{"a", "b"}
		schema := Array(String(new(string))).IsPresentFn(func() bool { return len(items) > 0 })
		assert.True(t, schema.IsPresent())
	})

	t.Run("map/no fn", func(t *testing.T) {
		schema := Map(String(new(string)))
		assert.False(t, schema.IsPresent())
	})

	t.Run("map/non-empty", func(t *testing.T) {
		m := map[string]string{"key": "value"}
		schema := Map(String(new(string))).IsPresentFn(func() bool { return len(m) > 0 })
		assert.True(t, schema.IsPresent())
	})

	t.Run("oneOf/none", func(t *testing.T) {
		v := ""
		assert.False(t, OneOfSchemas(String(&v)).IsPresent())
	})

	t.Run("oneOf/one", func(t *testing.T) {
		v := "hello"
		assert.True(t, OneOfSchemas(String(&v)).IsPresent())
	})

	t.Run("anyOf/none", func(t *testing.T) {
		v := ""
		assert.False(t, AnyOf(String(&v)).IsPresent())
	})

	t.Run("anyOf/one", func(t *testing.T) {
		v := "hello"
		assert.True(t, AnyOf(String(&v)).IsPresent())
	})

	t.Run("allOf/none", func(t *testing.T) {
		v := ""
		assert.False(t, AllOf(String(&v)).IsPresent())
	})

	t.Run("allOf/present", func(t *testing.T) {
		v := "hello"
		assert.True(t, AllOf(String(&v)).IsPresent())
	})
}
