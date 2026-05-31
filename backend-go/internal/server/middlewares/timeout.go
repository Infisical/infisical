package middlewares

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/infisical/api/internal/libs/requestid"
)

// Timeout returns middleware that cancels the request context after the given duration.
// If the handler doesn't complete in time, a 504 Gateway Timeout is returned.
func Timeout(duration time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), duration)
			defer cancel()

			done := make(chan struct{})
			tw := &timeoutWriter{ResponseWriter: w}

			go func() {
				next.ServeHTTP(tw, r.WithContext(ctx))
				close(done)
			}()

			select {
			case <-done:
				// Handler completed normally
			case <-ctx.Done():
				if ctx.Err() == context.DeadlineExceeded {
					tw.mu.Lock()
					defer tw.mu.Unlock()

					if !tw.written {
						reqID := requestid.FromContext(r.Context())
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusGatewayTimeout)

						resp := errorResponse{
							ReqID:      reqID,
							StatusCode: http.StatusGatewayTimeout,
							ErrorData:  "GatewayTimeoutError",
							Message:    "Request timed out",
						}
						_ = json.NewEncoder(w).Encode(resp)
					}
				}
			}
		})
	}
}

// timeoutWriter wraps http.ResponseWriter to track if headers were written.
type timeoutWriter struct {
	http.ResponseWriter
	mu      sync.Mutex
	written bool
}

func (tw *timeoutWriter) WriteHeader(code int) {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if !tw.written {
		tw.written = true
		tw.ResponseWriter.WriteHeader(code)
	}
}

func (tw *timeoutWriter) Write(b []byte) (int, error) {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if !tw.written {
		tw.written = true
	}
	return tw.ResponseWriter.Write(b)
}
