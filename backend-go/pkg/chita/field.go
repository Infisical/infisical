package chita

import (
	"encoding/json"
)

// Field is the interface implemented by Required and Optional.
type Field[T any] interface {
	Get() T
	Set(T)
	IsSet() bool
	IsRequired() bool
}

// Required represents a field that must be provided.
// For requests: validation fails if not set.
// For responses: ensures the field is always populated.
type Required[T any] struct {
	value T
	isSet bool
}

// Get returns the value.
func (r Required[T]) Get() T {
	return r.value
}

// Set sets the value and marks it as set.
func (r *Required[T]) Set(v T) {
	r.value = v
	r.isSet = true
}

// IsSet returns true if the value was explicitly set.
func (r Required[T]) IsSet() bool {
	return r.isSet
}

// IsRequired returns true (Required fields are always required).
func (r Required[T]) IsRequired() bool {
	return true
}

// MarshalJSON marshals just the value, making the wrapper transparent in JSON.
func (r Required[T]) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.value)
}

// UnmarshalJSON unmarshals into the value and marks it as set.
// Null is treated as "not set".
func (r *Required[T]) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil // isSet stays false
	}
	if err := json.Unmarshal(data, &r.value); err != nil {
		return err
	}
	r.isSet = true
	return nil
}

// Optional represents a field that may or may not be provided.
// For requests: defaults apply if not set.
// For responses: field may be omitted if not set (with omitempty).
// Tracks three states: absent, null, or value present.
//
// Implementation uses map[bool]T so that nil maps are properly omitted
// by json.Marshal with omitempty (structs are never considered empty).
// - nil map = not set (omitempty skips)
// - map[false]T = explicit null
// - map[true]T = value present
type Optional[T any] map[bool]T

// Get returns the value.
func (o Optional[T]) Get() T {
	return o[true]
}

// Set sets the value and marks it as set (not null).
func (o *Optional[T]) Set(v T) {
	if *o == nil {
		*o = make(Optional[T])
	}
	delete(*o, false) // remove null marker if present
	(*o)[true] = v
}

// SetNull marks the field as explicitly null.
func (o *Optional[T]) SetNull() {
	if *o == nil {
		*o = make(Optional[T])
	}
	delete(*o, true) // remove value if present
	var zero T
	(*o)[false] = zero
}

// IsSet returns true if the field was present in JSON (including null).
func (o Optional[T]) IsSet() bool {
	return o != nil
}

// IsNull returns true if the field was explicitly set to null.
func (o Optional[T]) IsNull() bool {
	if o == nil {
		return false
	}
	_, ok := o[false]
	return ok
}

// IsRequired returns false (Optional fields are never required).
func (o Optional[T]) IsRequired() bool {
	return false
}

// MarshalJSON marshals the value. If null, marshals as null.
// If not set (nil map), this won't be called when omitempty is used.
func (o Optional[T]) MarshalJSON() ([]byte, error) {
	if o.IsNull() {
		return []byte("null"), nil
	}
	return json.Marshal(o[true])
}

// UnmarshalJSON unmarshals into the value and tracks null vs value.
func (o *Optional[T]) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		o.SetNull()
		return nil
	}
	var v T
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	o.Set(v)
	return nil
}

// NewRequired creates a Required field with the given value (marked as set).
// Use this when constructing responses.
func NewRequired[T any](v T) Required[T] {
	return Required[T]{value: v, isSet: true}
}

// NewOptional creates an Optional field with the given value (marked as set).
// Use this when constructing responses or test requests.
func NewOptional[T any](v T) Optional[T] {
	return Optional[T]{true: v}
}

// NewOptionalNull creates an Optional field explicitly set to null.
func NewOptionalNull[T any]() Optional[T] {
	var zero T
	return Optional[T]{false: zero}
}

// --- String field helpers ---

// strFieldAccessor wraps Required[string] or Optional[string] for schema use.
type strFieldAccessor struct {
	req *Required[string]
	opt *Optional[string]
}

func (a *strFieldAccessor) Get() string {
	if a.req != nil {
		return a.req.Get()
	}
	return a.opt.Get()
}

func (a *strFieldAccessor) Set(v string) {
	if a.req != nil {
		a.req.Set(v)
	} else {
		a.opt.Set(v)
	}
}

func (a *strFieldAccessor) IsSet() bool {
	if a.req != nil {
		return a.req.IsSet()
	}
	return a.opt.IsSet()
}

func (a *strFieldAccessor) IsRequired() bool {
	return a.req != nil
}

// --- Bool field helpers ---

// boolFieldAccessor wraps Required[bool] or Optional[bool] for schema use.
type boolFieldAccessor struct {
	req *Required[bool]
	opt *Optional[bool]
}

func (a *boolFieldAccessor) Get() bool {
	if a.req != nil {
		return a.req.Get()
	}
	return a.opt.Get()
}

func (a *boolFieldAccessor) Set(v bool) {
	if a.req != nil {
		a.req.Set(v)
	} else {
		a.opt.Set(v)
	}
}

func (a *boolFieldAccessor) IsSet() bool {
	if a.req != nil {
		return a.req.IsSet()
	}
	return a.opt.IsSet()
}

func (a *boolFieldAccessor) IsRequired() bool {
	return a.req != nil
}

// --- Int field helpers ---

// intFieldAccessor wraps Required[int] or Optional[int] for schema use.
type intFieldAccessor struct {
	req   *Required[int]
	opt   *Optional[int]
	req64 *Required[int64]
	opt64 *Optional[int64]
}

func (a *intFieldAccessor) GetInt() int {
	if a.req != nil {
		return a.req.Get()
	}
	if a.opt != nil {
		return a.opt.Get()
	}
	if a.req64 != nil {
		return int(a.req64.Get())
	}
	return int(a.opt64.Get())
}

func (a *intFieldAccessor) GetInt64() int64 {
	if a.req64 != nil {
		return a.req64.Get()
	}
	if a.opt64 != nil {
		return a.opt64.Get()
	}
	if a.req != nil {
		return int64(a.req.Get())
	}
	return int64(a.opt.Get())
}

func (a *intFieldAccessor) SetInt(v int) {
	switch {
	case a.req != nil:
		a.req.Set(v)
	case a.opt != nil:
		a.opt.Set(v)
	case a.req64 != nil:
		a.req64.Set(int64(v))
	default:
		a.opt64.Set(int64(v))
	}
}

func (a *intFieldAccessor) SetInt64(v int64) {
	switch {
	case a.req64 != nil:
		a.req64.Set(v)
	case a.opt64 != nil:
		a.opt64.Set(v)
	case a.req != nil:
		a.req.Set(int(v))
	default:
		a.opt.Set(int(v))
	}
}

func (a *intFieldAccessor) IsSet() bool {
	if a.req != nil {
		return a.req.IsSet()
	}
	if a.opt != nil {
		return a.opt.IsSet()
	}
	if a.req64 != nil {
		return a.req64.IsSet()
	}
	return a.opt64.IsSet()
}

func (a *intFieldAccessor) IsRequired() bool {
	return a.req != nil || a.req64 != nil
}

// --- Float field helpers ---

// floatFieldAccessor wraps Required[float64] or Optional[float64] for schema use.
type floatFieldAccessor struct {
	req *Required[float64]
	opt *Optional[float64]
}

func (a *floatFieldAccessor) Get() float64 {
	if a.req != nil {
		return a.req.Get()
	}
	return a.opt.Get()
}

func (a *floatFieldAccessor) Set(v float64) {
	if a.req != nil {
		a.req.Set(v)
	} else {
		a.opt.Set(v)
	}
}

func (a *floatFieldAccessor) IsSet() bool {
	if a.req != nil {
		return a.req.IsSet()
	}
	return a.opt.IsSet()
}

func (a *floatFieldAccessor) IsRequired() bool {
	return a.req != nil
}
