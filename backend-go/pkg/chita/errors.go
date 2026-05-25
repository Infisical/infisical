package chita

import (
	"errors"
	"fmt"
)

// Error is the application-level error returned by handlers.
// It carries an HTTP-visible name, message, status code, and optional
// structured details. Follows the errutil convention.
type Error struct {
	Name    string
	Status  int
	Message string
	Details any
	Err     error
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

func (e *Error) WithName(name string) *Error {
	e.Name = name
	return e
}

func (e *Error) WithStatus(status int) *Error {
	e.Status = status
	return e
}

func (e *Error) WithMessage(message string) *Error {
	e.Message = message
	return e
}

func (e *Error) WithDetails(details any) *Error {
	e.Details = details
	return e
}

func (e *Error) WithErr(err error) *Error {
	e.Err = err
	return e
}

func (e *Error) WithErrf(format string, args ...any) *Error {
	e.Err = fmt.Errorf(format, args...)
	return e
}

// Error constructors

func BadRequest(format string, args ...any) *Error {
	return &Error{Name: "BadRequest", Status: 400, Message: fmt.Sprintf(format, args...)}
}

func Unauthorized(format string, args ...any) *Error {
	return &Error{Name: "UnauthorizedError", Status: 401, Message: fmt.Sprintf(format, args...)}
}

func Forbidden(format string, args ...any) *Error {
	return &Error{Name: "ForbiddenError", Status: 403, Message: fmt.Sprintf(format, args...)}
}

func NotFound(format string, args ...any) *Error {
	return &Error{Name: "NotFound", Status: 404, Message: fmt.Sprintf(format, args...)}
}

func Conflict(format string, args ...any) *Error {
	return &Error{Name: "Conflict", Status: 409, Message: fmt.Sprintf(format, args...)}
}

func UnprocessableEntity(format string, args ...any) *Error {
	return &Error{Name: "UnprocessableEntity", Status: 422, Message: fmt.Sprintf(format, args...)}
}

func RateLimit(format string, args ...any) *Error {
	return &Error{Name: "RateLimitExceeded", Status: 429, Message: fmt.Sprintf(format, args...)}
}

func InternalServer(format string, args ...any) *Error {
	return &Error{Name: "InternalServerError", Status: 500, Message: fmt.Sprintf(format, args...)}
}

func DatabaseErr(format string, args ...any) *Error {
	return &Error{Name: "DatabaseError", Status: 500, Message: fmt.Sprintf(format, args...)}
}

func GatewayTimeout(format string, args ...any) *Error {
	return &Error{Name: "GatewayTimeoutError", Status: 504, Message: fmt.Sprintf(format, args...)}
}

// ValidationErr creates a 400 error from validation errors.
func ValidationErr(errs []ValidationError) *Error {
	return &Error{
		Name:    "ValidationError",
		Status:  400,
		Message: "Validation failed",
		Details: errs,
	}
}

// AsError extracts an *Error from err if present.
func AsError(err error) (*Error, bool) {
	var apiErr *Error
	if errors.As(err, &apiErr) {
		return apiErr, true
	}
	return nil, false
}

// AsValidationErrors extracts ValidationErrors from err if present.
func AsValidationErrors(err error) (ValidationErrors, bool) {
	var validationErrs ValidationErrors
	if errors.As(err, &validationErrs) {
		return validationErrs, true
	}
	return nil, false
}
