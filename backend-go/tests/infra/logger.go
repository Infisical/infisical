//go:build integration

package infra

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/infisical/api/internal/libs/errutil"
)

// NopLogger returns a logger that discards all output.
func NopLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}

// NopErrorHandler implements apiauth.ErrorHandler for tests.
// It writes error responses without logging.
type NopErrorHandler struct{}

// NewNopErrorHandler creates a NopErrorHandler for tests.
func NewNopErrorHandler() *NopErrorHandler {
	return &NopErrorHandler{}
}

// HandleError writes an error response without logging.
func (h *NopErrorHandler) HandleError(w http.ResponseWriter, _ *http.Request, statusCode int, err error) {
	w.Header().Set("Content-Type", "application/json")

	var httpErr *errutil.Error
	if errors.As(err, &httpErr) {
		status := httpErr.Status
		if status == 0 {
			status = statusCode
		}
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"statusCode": status,
			"error":      httpErr.Name,
			"message":    httpErr.Message,
		})
		return
	}

	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"statusCode": statusCode,
		"error":      "UnknownError",
		"message":    err.Error(),
	})
}
