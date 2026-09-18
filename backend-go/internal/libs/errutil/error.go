package errutil

import (
	"fmt"
	"strconv"
	"strings"
)

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

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}

	return e.Message
}

// EncodedErrorCode acts as identifier for errors originating at services , preserved in encoding in grpc transit
type EncodedErrorCode uint

const (
	// 4xx
	BadRequestErrorCode   EncodedErrorCode = 400
	UnauthorizedErrorCode EncodedErrorCode = 401
	ForbiddenErrorCode    EncodedErrorCode = 403
	NotFoundErrorCode     EncodedErrorCode = 404
	RateLimitErrorCode    EncodedErrorCode = 429

	// 5xx
	InternalServerErrorCode EncodedErrorCode = 500
	GatewayTimeoutErrorCode EncodedErrorCode = 504

	// Application-specific 5xx classes.
	// These cannot reuse 500 if we want to preserve error type.
	DatabaseErrorCode      EncodedErrorCode = 550
	UnidentifiedErrorCode  EncodedErrorCode = 551
	CryptographicErrorCode EncodedErrorCode = 552
)

// encodes with internal codes into generic type error
// use NewFromEnc to rebuild the original type Error
func (e *Error) EncError() error {
	if e == nil {
		return nil
	}

	var code EncodedErrorCode

	switch e.Name {
	case "BadRequest":
		code = BadRequestErrorCode

	case "UnauthorizedError":
		code = UnauthorizedErrorCode

	case "ForbiddenError":
		code = ForbiddenErrorCode

	case "NotFound":
		code = NotFoundErrorCode

	case "RateLimitExceeded":
		code = RateLimitErrorCode

	case "InternalServerError":
		code = InternalServerErrorCode

	case "DatabaseError":
		code = DatabaseErrorCode

	case "UnidentifiedError":
		code = UnidentifiedErrorCode

	case "CryptographicError":
		code = CryptographicErrorCode

	case "GatewayTimeoutError":
		code = GatewayTimeoutErrorCode

	default:
		// Unknown application errors are treated as internal errors.
		code = InternalServerErrorCode
	}

	return fmt.Errorf("%d:%s", code, e.Message)
}

// NewFromEnc
// unidenfied errors are parsed as InternalServerError
func NewFromEnc(err error) *Error {
	if err == nil {
		return nil
	}

	codeStr, message, found := strings.Cut(err.Error(), ":")
	if !found {
		return Unidentified(err)
	}

	n, parseErr := strconv.ParseUint(codeStr, 10, 32)
	if parseErr != nil {
		return Unidentified(err)
	}

	code := EncodedErrorCode(n)

	switch code {
	case BadRequestErrorCode:
		return BadRequest("%s", message)

	case UnauthorizedErrorCode:
		return Unauthorized("%s", message)

	case ForbiddenErrorCode:
		return Forbidden("%s", message)

	case NotFoundErrorCode:
		return NotFound("%s", message)

	case RateLimitErrorCode:
		return RateLimit("%s", message)

	case InternalServerErrorCode:
		return InternalServer("%s", message)

	case DatabaseErrorCode:
		return DatabaseErr("%s", message)

	case UnidentifiedErrorCode:
		return Unidentified(err)

	case CryptographicErrorCode:
		return CryptographicErr("%s", message)

	case GatewayTimeoutErrorCode:
		return GatewayTimeout("%s", message)

	default:
		return InternalServer("%s", message)
	}
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

// WithErrf wraps an underlying cause using fmt.Errorf formatting.
// Use this to add function context: .WithErrf("FunctionName(arg=%s): %w", argValue, err)
func (e *Error) WithErrf(format string, args ...any) *Error {
	e.Err = fmt.Errorf(format, args...)

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

// CryptographicErr creates a 500 error for failures during cryptographic operations.
func CryptographicErr(format string, args ...any) *Error {
	return &Error{Name: "CryptographicError", Status: 500, Message: fmt.Sprintf(format, args...)}
}

// GatewayTimeout creates a 504 error.
func GatewayTimeout(format string, args ...any) *Error {
	return &Error{Name: "GatewayTimeoutError", Status: 504, Message: fmt.Sprintf(format, args...)}
}

func Unidentified(err error) *Error {
	return &Error{
		Name:    "UnidentifiedError",
		Status:  500,
		Message: "unidentified error",
		Err:     err,
	}
}
