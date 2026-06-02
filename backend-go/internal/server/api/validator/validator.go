// Package validator provides a shared configured validator instance for all API handlers.
package validator

import (
	"reflect"
	"strings"

	"github.com/doordash-oss/oapi-codegen-dd/v3/pkg/runtime"
	"github.com/go-playground/validator/v10"
)

// V is the shared validator instance configured with JSON tag names.
var V *validator.Validate

func init() {
	V = validator.New(validator.WithRequiredStructEnabled())
	V.RegisterTagNameFunc(func(fld reflect.StructField) string {
		name := strings.SplitN(fld.Tag.Get("json"), ",", 2)[0]
		if name == "-" {
			return ""
		}
		return name
	})
	runtime.RegisterCustomTypeFunc(V)
}
