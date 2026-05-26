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
		// String (using Required/Optional)
		{"string/not-set", func() Schema { var v Required[string]; return Str(&v) }, false},
		{"string/empty", func() Schema { v := NewRequired(""); return Str(&v) }, false},
		{"string/non-empty", func() Schema { v := NewRequired("hello"); return Str(&v) }, true},
		{"string/whitespace", func() Schema { v := NewRequired("   "); return Str(&v) }, true},

		// Int (using Required/Optional)
		{"int/not-set", func() Schema { var v Required[int]; return Int(&v) }, false},
		{"int/zero", func() Schema { v := NewRequired(0); return Int(&v) }, true},
		{"int/non-zero", func() Schema { v := NewRequired(42); return Int(&v) }, true},
		{"int/negative", func() Schema { v := NewRequired(-10); return Int(&v) }, true},

		// Float (using Required/Optional)
		{"float/not-set", func() Schema { var v Required[float64]; return Float(&v) }, false},
		{"float/zero", func() Schema { v := NewRequired(0.0); return Float(&v) }, true},
		{"float/non-zero", func() Schema { v := NewRequired(3.14); return Float(&v) }, true},

		// Bool (using Required/Optional)
		{"bool/not-set", func() Schema { var v Required[bool]; return Bool(&v) }, false},
		{"bool/false", func() Schema { v := NewRequired(false); return Bool(&v) }, true},
		{"bool/true", func() Schema { v := NewRequired(true); return Bool(&v) }, true},

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
		var name Required[string] // not set
		schema := Object(map[string]Schema{"name": Str(&name)})
		assert.False(t, schema.IsPresent())
	})

	t.Run("object/one present", func(t *testing.T) {
		name := NewRequired("John")
		schema := Object(map[string]Schema{"name": Str(&name)})
		assert.True(t, schema.IsPresent())
	})

	t.Run("object/partial present", func(t *testing.T) {
		var name Required[string] // not set
		age := NewRequired(25)
		schema := Object(map[string]Schema{"name": Str(&name), "age": Int(&age)})
		assert.True(t, schema.IsPresent())
	})

	t.Run("array/no fn", func(t *testing.T) {
		schema := Array(StringElem(nil))
		assert.False(t, schema.IsPresent())
	})

	t.Run("array/empty", func(t *testing.T) {
		items := []string{}
		schema := Array(StringElem(nil)).IsPresentFn(func() bool { return len(items) > 0 })
		assert.False(t, schema.IsPresent())
	})

	t.Run("array/non-empty", func(t *testing.T) {
		items := []string{"a", "b"}
		schema := Array(StringElem(nil)).IsPresentFn(func() bool { return len(items) > 0 })
		assert.True(t, schema.IsPresent())
	})

	t.Run("map/no fn", func(t *testing.T) {
		schema := Map(StringElem(nil))
		assert.False(t, schema.IsPresent())
	})

	t.Run("map/non-empty", func(t *testing.T) {
		m := map[string]string{"key": "value"}
		schema := Map(StringElem(nil)).IsPresentFn(func() bool { return len(m) > 0 })
		assert.True(t, schema.IsPresent())
	})

	t.Run("oneOf/none", func(t *testing.T) {
		var v Required[string]
		assert.False(t, OneOfSchemas(Str(&v)).IsPresent())
	})

	t.Run("oneOf/one", func(t *testing.T) {
		v := NewRequired("hello")
		assert.True(t, OneOfSchemas(Str(&v)).IsPresent())
	})

	t.Run("anyOf/none", func(t *testing.T) {
		var v Required[string]
		assert.False(t, AnyOf(Str(&v)).IsPresent())
	})

	t.Run("anyOf/one", func(t *testing.T) {
		v := NewRequired("hello")
		assert.True(t, AnyOf(Str(&v)).IsPresent())
	})

	t.Run("allOf/none", func(t *testing.T) {
		var v Required[string]
		assert.False(t, AllOf(Str(&v)).IsPresent())
	})

	t.Run("allOf/present", func(t *testing.T) {
		v := NewRequired("hello")
		assert.True(t, AllOf(Str(&v)).IsPresent())
	})
}
