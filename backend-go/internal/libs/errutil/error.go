package errutil

import "fmt"

// Error is the application-level error returned by services.
// It carries an HTTP-visible name, message, status code, and optional
// structured details. It implements the error interface.
type Error struct {
	// Name is the stable error class name sent in JSON responses (e.g. "NotFound").
	Name string
	// Status is the HTTP status code (e.g. 404).
	Status int
	// Message is the human-readable message sent to the client (4xx only; 5xx are masked).
	Message string
	// Details holds optional structured data (validation errors, policy info, etc.).
	// Omitted from JSON if nil.
	Details any
	// Err is the underlying error, if any. Never exposed to clients.
	Err error
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}

	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Err
}

// WithDetails attaches optional structured data to the error.
func (e *Error) WithDetails(details any) *Error {
	e.Details = details

	return e
}

// WithErr wraps an underlying cause. The cause is logged but never sent to clients.
func (e *Error) WithErr(err error) *Error {
	e.Err = err

	return e
}

// BadRequest creates a 400 error.
func BadRequest(format string, args ...any) *Error {
	return &Error{Name: "BadRequest", Status: 400, Message: fmt.Sprintf(format, args...)}
}

// Unauthorized creates a 401 error.
func Unauthorized(format string, args ...any) *Error {
	return &Error{Name: "UnauthorizedError", Status: 401, Message: fmt.Sprintf(format, args...)}
}

// Forbidden creates a 403 error.
func Forbidden(format string, args ...any) *Error {
	return &Error{Name: "ForbiddenError", Status: 403, Message: fmt.Sprintf(format, args...)}
}

// NotFound creates a 404 error.
func NotFound(format string, args ...any) *Error {
	return &Error{Name: "NotFound", Status: 404, Message: fmt.Sprintf(format, args...)}
}

// RateLimit creates a 429 error.
func RateLimit(format string, args ...any) *Error {
	return &Error{Name: "RateLimitExceeded", Status: 429, Message: fmt.Sprintf(format, args...)}
}

// InternalServer creates a 500 error.
func InternalServer(format string, args ...any) *Error {
	return &Error{Name: "InternalServerError", Status: 500, Message: fmt.Sprintf(format, args...)}
}

// DatabaseErr creates a 500 database error.
func DatabaseErr(format string, args ...any) *Error {
	return &Error{Name: "DatabaseError", Status: 500, Message: fmt.Sprintf(format, args...)}
}

// GatewayTimeout creates a 504 error.
func GatewayTimeout(format string, args ...any) *Error {
	return &Error{Name: "GatewayTimeoutError", Status: 504, Message: fmt.Sprintf(format, args...)}
}
