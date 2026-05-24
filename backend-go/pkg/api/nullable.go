package api

import (
	"bytes"
	"encoding/json"
)

// JsonNullable distinguishes between absent, null, and present JSON values.
// Use this for optional request bodies or fields where you need to tell apart:
//   - Field not present in JSON (Present=false, Null=false)
//   - Field explicitly set to null (Present=true, Null=true)
//   - Field has a value (Present=true, Null=false, Value populated)
type JsonNullable[T any] struct {
	Value   T
	Present bool // true if the key existed in JSON (even if value was null)
	Null    bool // true if the value was explicitly "null"
}

// IsSet returns true if a non-null value was provided
func (j JsonNullable[T]) IsSet() bool {
	return j.Present && !j.Null
}

// UnmarshalJSON implements json.Unmarshaler
func (j *JsonNullable[T]) UnmarshalJSON(data []byte) error {
	j.Present = true
	if bytes.Equal(data, []byte("null")) {
		j.Null = true
		return nil
	}
	return json.Unmarshal(data, &j.Value)
}

// MarshalJSON implements json.Marshaler
func (j JsonNullable[T]) MarshalJSON() ([]byte, error) {
	if !j.Present || j.Null {
		return []byte("null"), nil
	}
	return json.Marshal(j.Value)
}

// Ptr returns a pointer to the value if set, nil otherwise.
// Useful for passing to schema validators.
func (j *JsonNullable[T]) Ptr() *T {
	if j.IsSet() {
		return &j.Value
	}
	return nil
}

// Set creates a JsonNullable with a value
func Set[T any](value T) JsonNullable[T] {
	return JsonNullable[T]{
		Value:   value,
		Present: true,
		Null:    false,
	}
}

// Null creates a JsonNullable that is explicitly null
func Null[T any]() JsonNullable[T] {
	return JsonNullable[T]{
		Present: true,
		Null:    true,
	}
}

// Absent creates a JsonNullable that represents an absent field
func Absent[T any]() JsonNullable[T] {
	return JsonNullable[T]{
		Present: false,
		Null:    false,
	}
}

// NullableSchema wraps any schema to handle the absent/null/present tri-state.
// Use this for PATCH semantics where you need to distinguish:
//   - Field absent → don't update
//   - Field null → clear/unset the value
//   - Field present → update with value
//
// Usage:
//
//	type UpdateRequest struct {
//	    Name JsonNullable[string] `json:"name"`
//	}
//
//	func (r *UpdateRequest) Schema() *ObjectSchema {
//	    return Object(map[string]Schema{
//	        "name": Nullable(&r.Name, String(&r.Name.Value).MinLength(1)).Optional(),
//	    })
//	}
type NullableSchema[T any] struct {
	ptr         *JsonNullable[T]
	inner       Schema
	required    bool
	title       string
	description string
	deprecated  bool
	example     any
}

// Nullable creates a NullableSchema wrapping an inner schema.
// The inner schema should bind to the JsonNullable's Value field.
func Nullable[T any](ptr *JsonNullable[T], inner Schema) *NullableSchema[T] {
	return &NullableSchema[T]{
		ptr:   ptr,
		inner: inner,
	}
}

func (s *NullableSchema[T]) Required() *NullableSchema[T] {
	s.required = true
	return s
}

func (s *NullableSchema[T]) Optional() *NullableSchema[T] {
	s.required = false
	return s
}

func (s *NullableSchema[T]) Title(val string) *NullableSchema[T] {
	s.title = val
	return s
}

func (s *NullableSchema[T]) Description(val string) *NullableSchema[T] {
	s.description = val
	return s
}

func (s *NullableSchema[T]) Deprecated() *NullableSchema[T] {
	s.deprecated = true
	return s
}

func (s *NullableSchema[T]) Example(val any) *NullableSchema[T] {
	s.example = val
	return s
}

func (s *NullableSchema[T]) IsRequired() bool {
	return s.required
}

func (s *NullableSchema[T]) GetSource() ParamSource {
	return s.inner.GetSource()
}

// IsPresent returns true if a non-null value was provided
func (s *NullableSchema[T]) IsPresent() bool {
	return s.ptr != nil && s.ptr.Present && !s.ptr.Null
}

// IsNull returns true if the field was explicitly set to null
func (s *NullableSchema[T]) IsNull() bool {
	return s.ptr != nil && s.ptr.Present && s.ptr.Null
}

// IsAbsent returns true if the field was not present in the JSON
func (s *NullableSchema[T]) IsAbsent() bool {
	return s.ptr == nil || !s.ptr.Present
}

func (s *NullableSchema[T]) Validate() []ValidationError {
	if s.ptr == nil || !s.ptr.Present {
		// Field absent
		if s.required {
			return []ValidationError{{Code: "required", Message: "is required"}}
		}
		return nil
	}

	if s.ptr.Null {
		// Explicitly null
		if s.required {
			return []ValidationError{{Code: "required", Message: "cannot be null"}}
		}
		return nil
	}

	// Present with value - validate inner schema (skip its required check)
	return s.inner.Validate()
}

func (s *NullableSchema[T]) OpenAPI() map[string]any {
	schema := s.inner.OpenAPI()
	schema["nullable"] = true

	if s.title != "" {
		schema["title"] = s.title
	}
	if s.description != "" {
		schema["description"] = s.description
	}
	if s.deprecated {
		schema["deprecated"] = true
	}
	if s.example != nil {
		schema["example"] = s.example
	}

	return schema
}
