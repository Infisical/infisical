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

					if !tw.wroteHeader {
						tw.timedOut = true
						reqID := requestid.FromContext(r.Context())
						tw.ResponseWriter.Header().Set("Content-Type", "application/json")
						tw.ResponseWriter.WriteHeader(http.StatusGatewayTimeout)

						resp := errorResponse{
							ReqID:      reqID,
							StatusCode: http.StatusGatewayTimeout,
							ErrorData:  "GatewayTimeoutError",
							Message:    "Request timed out",
						}
						_ = json.NewEncoder(tw.ResponseWriter).Encode(resp)
					}
				}
			}
		})
	}
}

// timeoutWriter wraps http.ResponseWriter to track if headers were written.
// It prevents the timeout path from overwriting a handler's response, and
// prevents the handler from writing after the timeout has responded.
type timeoutWriter struct {
	http.ResponseWriter
	mu          sync.Mutex
	timedOut    bool // true if timeout path has taken over the response
	wroteHeader bool // true if any WriteHeader call succeeded
}

func (tw *timeoutWriter) WriteHeader(code int) {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if tw.timedOut || tw.wroteHeader {
		return
	}
	tw.wroteHeader = true
	tw.ResponseWriter.WriteHeader(code)
}

func (tw *timeoutWriter) Write(b []byte) (int, error) {
	tw.mu.Lock()
	defer tw.mu.Unlock()
	if tw.timedOut {
		// Timeout already wrote response, discard handler's late writes
		return len(b), nil
	}
	if !tw.wroteHeader {
		// Implicit WriteHeader(200) per http.ResponseWriter contract
		tw.wroteHeader = true
		tw.ResponseWriter.WriteHeader(http.StatusOK)
	}
	return tw.ResponseWriter.Write(b)
}
