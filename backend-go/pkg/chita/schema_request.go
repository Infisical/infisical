package chita

import (
	"fmt"
	"net/url"
	"strings"
)

// ValueGetter is implemented by schema types that can return their bound value.
type ValueGetter interface {
	GetValue() any
	IsZero() bool
}

// GetValue returns the bound string value.
func (s *StringSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *StringSchema) IsZero() bool {
	return s.ptr == nil || *s.ptr == ""
}

// GetValue returns the bound int value.
func (s *IntSchema) GetValue() any {
	if s.ptr != nil {
		return *s.ptr
	}
	if s.ptr64 != nil {
		return *s.ptr64
	}
	return nil
}

// IsZero returns true if the value is zero/empty.
func (s *IntSchema) IsZero() bool {
	if s.ptr != nil {
		return *s.ptr == 0
	}
	if s.ptr64 != nil {
		return *s.ptr64 == 0
	}
	return true
}

// GetValue returns the bound float value.
func (s *FloatSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *FloatSchema) IsZero() bool {
	return s.ptr == nil || *s.ptr == 0
}

// GetValue returns the bound bool value.
func (s *BoolSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *BoolSchema) IsZero() bool {
	return s.ptr == nil
}

// GetValue returns the bound UUID value.
func (s *UUIDSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return s.ptr.String()
}

// IsZero returns true if the value is zero/empty.
func (s *UUIDSchema) IsZero() bool {
	return s.ptr == nil || *s.ptr == [16]byte{}
}

// GetValue returns the bound time value.
func (s *TimeSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return s.ptr.Format("2006-01-02T15:04:05Z07:00")
}

// IsZero returns true if the value is zero/empty.
func (s *TimeSchema) IsZero() bool {
	return s.ptr == nil || s.ptr.IsZero()
}

// GetValue returns the bound bytes value.
func (s *BytesSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *BytesSchema) IsZero() bool {
	return s.ptr == nil || len(*s.ptr) == 0
}

// GetValue returns the bound any value.
func (s *AnySchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *AnySchema) IsZero() bool {
	return s.ptr == nil || *s.ptr == nil
}

// GetValue returns the bound raw JSON value.
func (s *RawSchema) GetValue() any {
	if s.ptr == nil {
		return nil
	}
	return *s.ptr
}

// IsZero returns true if the value is zero/empty.
func (s *RawSchema) IsZero() bool {
	return s.ptr == nil || len(*s.ptr) == 0
}

// BuildRequest builds the URL path and body from the schema's bound values.
// It uses the Source of each field to determine if it goes in path, query, or body.
// Returns the path (with query string) and a map of body fields.
func (s *ObjectSchema) BuildRequest(basePath string) (path string, body map[string]any) {
	path = basePath
	query := url.Values{}
	body = make(map[string]any)

	for name, field := range s.properties {
		source := field.GetSource()

		valueGetter, ok := field.(ValueGetter)
		if !ok {
			continue
		}

		if valueGetter.IsZero() {
			continue
		}

		value := valueGetter.GetValue()

		switch source {
		case SourcePath:
			path = strings.Replace(path, "{"+name+"}", fmt.Sprint(value), 1)
		case SourceQuery:
			query.Set(name, fmt.Sprint(value))
		default:
			body[name] = value
		}
	}

	if len(query) > 0 {
		path += "?" + query.Encode()
	}

	return
}
