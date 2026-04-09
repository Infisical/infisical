package errutil

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	goahttp "goa.design/goa/v3/http"
	goa "goa.design/goa/v3/pkg"

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

// StatusCode implements goahttp.Statuser so Goa writes the correct HTTP status.
func (b *ErrorBody) StatusCode() int {
	return b.Code
}

// NewFormatter returns a Goa-compatible error formatter that maps errutil.Error
// and goa.ServiceError to the standard JSON response shape.
//
// Three error categories are handled:
//  1. *errutil.Error (service errors) — 4xx logged at WARN with message sent to client;
//     5xx logged at ERROR with message masked as "Something went wrong".
//  2. *goa.ServiceError (Goa validation/decode errors) — logged at WARN, mapped to status.
//  3. Any other error (unknown) — logged at ERROR, returns 500 with safe message.
func NewFormatter(logger *slog.Logger) func(ctx context.Context, err error) goahttp.Statuser {
	return func(ctx context.Context, err error) goahttp.Statuser {
		reqID := requestid.FromContext(ctx)
		service, _ := ctx.Value(goa.ServiceKey).(string)
		method, _ := ctx.Value(goa.MethodKey).(string)

		var apiErr *Error
		if errors.As(err, &apiErr) {
			if apiErr.Status >= http.StatusInternalServerError {
				logger.ErrorContext(ctx, "server error",
					slog.String("service", service),
					slog.String("method", method),
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
				slog.String("service", service),
				slog.String("method", method),
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

		var goaErr *goa.ServiceError
		if errors.As(err, &goaErr) {
			status := mapGoaErrorStatus(goaErr)
			logger.WarnContext(ctx, "goa validation error",
				slog.String("service", service),
				slog.String("method", method),
				slog.String("name", goaErr.Name),
				slog.Int("status", status),
				slog.String("message", goaErr.Message),
			)

			return &ErrorBody{
				Code:    status,
				Message: goaErr.Message,
				Err:     goaErr.Name,
				ReqID:   reqID,
			}
		}

		logger.ErrorContext(ctx, "unhandled server error",
			slog.String("service", service),
			slog.String("method", method),
			slog.Any("error", err),
		)

		return &ErrorBody{
			Code:    http.StatusInternalServerError,
			Message: "Something went wrong",
			Err:     "InternalServerError",
			ReqID:   reqID,
		}
	}
}

// mapGoaErrorStatus maps Goa's ServiceError to HTTP status codes.
func mapGoaErrorStatus(err *goa.ServiceError) int {
	if err.Fault {
		return http.StatusInternalServerError
	}

	if err.Timeout {
		return http.StatusGatewayTimeout
	}

	return http.StatusBadRequest
}
