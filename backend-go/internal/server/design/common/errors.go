package common

import (
	. "goa.design/goa/v3/dsl"
)

// APIErrorResult is the standard error response shape for all API endpoints.
// It matches the Node.js backend format for API compatibility.
var APIErrorResult = Type("APIErrorResult", func() {
	Attribute("statusCode", Int, "HTTP status code")
	Attribute("message", String, "Human-readable error message")
	Attribute("error", String, "Error class name", func() {
		Meta("struct:field:name", "ErrorClass")
	})
	Attribute("details", Any, "Optional structured details")
	Required("statusCode", "message", "error")
})

// CommonServiceErrors adds the standard API error references to a Service DSL.
// Call this inside every Service() block so all methods inherit error responses.
func CommonServiceErrors() {
	Error("bad_request", APIErrorResult)
	Error("unauthorized", APIErrorResult)
	Error("forbidden", APIErrorResult)
	Error("not_found", APIErrorResult)
	Error("internal_error", APIErrorResult)
}
