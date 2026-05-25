package server

import (
	"context"
	"errors"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/pkg/chita"
)

// NewErrorHandler creates an error handler for the chita framework that
// integrates with errutil.Error and validation errors.
func NewErrorHandler(logger *slog.Logger) chita.ErrorHandler {
	return func(ctx context.Context, err error) *chita.ErrorBody {
		reqID := requestid.FromContext(ctx)

		// Handle errutil.Error (service layer errors)
		var apiErr *errutil.Error
		if errors.As(err, &apiErr) {
			if apiErr.Status >= 500 {
				logger.ErrorContext(ctx, "server error",
					slog.String("reqId", reqID),
					slog.String("name", apiErr.Name),
					slog.Int("status", apiErr.Status),
					slog.String("message", apiErr.Message),
					slog.Any("cause", apiErr.Err),
				)
				return &chita.ErrorBody{
					StatusCode: apiErr.Status,
					Message:    "Something went wrong",
					Error:      apiErr.Name,
				}
			}

			logger.WarnContext(ctx, "client error",
				slog.String("reqId", reqID),
				slog.String("name", apiErr.Name),
				slog.Int("status", apiErr.Status),
				slog.String("message", apiErr.Message),
			)
			return &chita.ErrorBody{
				StatusCode: apiErr.Status,
				Message:    apiErr.Message,
				Error:      apiErr.Name,
				Details:    apiErr.Details,
			}
		}

		// Handle chita.Error (handler layer errors)
		var chitaErr *chita.Error
		if errors.As(err, &chitaErr) {
			if chitaErr.Status >= 500 {
				logger.ErrorContext(ctx, "server error",
					slog.String("reqId", reqID),
					slog.String("name", chitaErr.Name),
					slog.Int("status", chitaErr.Status),
					slog.String("message", chitaErr.Message),
					slog.Any("cause", chitaErr.Err),
				)
				return &chita.ErrorBody{
					StatusCode: chitaErr.Status,
					Message:    "Something went wrong",
					Error:      chitaErr.Name,
				}
			}

			logger.WarnContext(ctx, "client error",
				slog.String("reqId", reqID),
				slog.String("name", chitaErr.Name),
				slog.Int("status", chitaErr.Status),
				slog.String("message", chitaErr.Message),
			)
			return &chita.ErrorBody{
				StatusCode: chitaErr.Status,
				Message:    chitaErr.Message,
				Error:      chitaErr.Name,
				Details:    chitaErr.Details,
			}
		}

		// Handle validation errors from chita schema validation
		if validationErrs, ok := chita.AsValidationErrors(err); ok {
			logger.WarnContext(ctx, "validation error",
				slog.String("reqId", reqID),
				slog.Any("errors", validationErrs),
			)
			return &chita.ErrorBody{
				StatusCode: 400,
				Message:    "Validation failed",
				Error:      "ValidationError",
				Details:    validationErrs,
			}
		}

		// Unknown error - treat as 500
		logger.ErrorContext(ctx, "unhandled error",
			slog.String("reqId", reqID),
			slog.Any("error", err),
		)
		return &chita.ErrorBody{
			StatusCode: 500,
			Message:    "Something went wrong",
			Error:      "InternalServerError",
		}
	}
}
