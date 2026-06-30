package middlewares

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/infisical/api/internal/libs/requestid"
)

// errorResponse matches the format used by shared.ErrorHandler.
type errorResponse struct {
	ReqID      string `json:"reqId"`
	StatusCode int    `json:"statusCode"`
	ErrorData  string `json:"error"`
	Message    string `json:"message"`
}

// Recoverer returns middleware that recovers from panics and writes a JSON error response.
// It logs the panic with stack trace and returns the same error format as shared.ErrorHandler.
func Recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					reqID := requestid.FromContext(r.Context())
					stack := string(debug.Stack())

					logger.ErrorContext(r.Context(), "panic recovered",
						slog.String("reqId", reqID),
						slog.Any("panic", rec),
						slog.String("stack", stack),
					)

					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusInternalServerError)

					resp := errorResponse{
						ReqID:      reqID,
						StatusCode: http.StatusInternalServerError,
						ErrorData:  "InternalServerError",
						Message:    "Something went wrong",
					}
					_ = json.NewEncoder(w).Encode(resp)
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
