package errutil

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/infisical/api/internal/libs/requestid"
)

// ErrorBody is the JSON response shape sent to clients on error.
// It matches the Node.js backend format for API compatibility.
type ErrorBody struct {
	Code    int    `json:"statusCode"`
	Message string `json:"message"`
	Err     string `json:"error"`
	Details any    `json:"details,omitempty"`
	ReqID   string `json:"reqId,omitempty"`
}

// StatusCode returns the HTTP status code for the error.
func (b *ErrorBody) StatusCode() int {
	return b.Code
}

// FormatError formats an error into an ErrorBody for API responses.
// Service errors (4xx) are logged at WARN level with message sent to client.
// Server errors (5xx) are logged at ERROR level with message masked.
// Unknown errors are logged at ERROR and return 500.
func FormatError(logger *slog.Logger, ctx context.Context, err error) *ErrorBody {
	reqID := requestid.FromContext(ctx)

	var apiErr *Error
	if errors.As(err, &apiErr) {
		if apiErr.Status >= http.StatusInternalServerError {
			logger.ErrorContext(ctx, "server error",
				slog.String("name", apiErr.Name),
				slog.Int("status", apiErr.Status),
				slog.String("message", apiErr.Message),
				slog.Any("cause", apiErr.Err),
			)

			return &ErrorBody{
				Code:    apiErr.Status,
				Message: "Something went wrong",
				Err:     apiErr.Name,
				ReqID:   reqID,
			}
		}

		logger.WarnContext(ctx, "api error",
			slog.String("name", apiErr.Name),
			slog.Int("status", apiErr.Status),
			slog.String("message", apiErr.Message),
			slog.Any("cause", apiErr.Err),
		)

		return &ErrorBody{
			Code:    apiErr.Status,
			Message: apiErr.Message,
			Err:     apiErr.Name,
			Details: apiErr.Details,
			ReqID:   reqID,
		}
	}

	logger.ErrorContext(ctx, "unhandled server error", slog.Any("error", err))

	return &ErrorBody{
		Code:    http.StatusInternalServerError,
		Message: "Something went wrong",
		Err:     "InternalServerError",
		ReqID:   reqID,
	}
}
