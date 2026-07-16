package middlewares

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/libs/requestid"
)

func TestTimeout_HandlerCompletesBeforeDeadline(t *testing.T) {
	t.Parallel()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	middleware := Timeout(100 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, `{"status":"ok"}`, rec.Body.String())
}

func TestTimeout_HandlerExceedsDeadline(t *testing.T) {
	t.Parallel()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(200 * time.Millisecond):
			w.WriteHeader(http.StatusOK)
		case <-r.Context().Done():
			// Context canceled, handler should exit
		}
	})

	middleware := Timeout(50 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusGatewayTimeout, rec.Code)
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var resp errorResponse
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, http.StatusGatewayTimeout, resp.StatusCode)
	assert.Equal(t, "GatewayTimeoutError", resp.ErrorData)
	assert.Equal(t, "Request timed out", resp.Message)
}

func TestTimeout_IncludesRequestID(t *testing.T) {
	t.Parallel()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // wait for timeout
	})

	// Chain requestid middleware before timeout middleware
	timeoutMiddleware := Timeout(10 * time.Millisecond)
	wrapped := requestid.Middleware(timeoutMiddleware(handler))

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req.Header.Set(requestid.Header, "test-request-123")
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	var resp errorResponse
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "test-request-123", resp.ReqID)
}

func TestTimeout_HandlerWritesBeforeTimeout_NoDoubleWrite(t *testing.T) {
	t.Parallel()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"accepted":true}`))
		// Simulate slow cleanup after writing
		time.Sleep(100 * time.Millisecond)
	})

	// Timeout fires while handler is doing slow cleanup, but after it wrote
	middleware := Timeout(20 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	// Handler's response should be preserved, not overwritten by timeout
	assert.Equal(t, http.StatusAccepted, rec.Code)
	assert.Equal(t, `{"accepted":true}`, rec.Body.String())
}

func TestTimeout_HandlerWritesAfterTimeout_Discarded(t *testing.T) {
	t.Parallel()

	handlerWriteAttempted := make(chan struct{})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wait for context to be canceled (timeout)
		<-r.Context().Done()
		// Small delay to ensure timeout path runs first
		time.Sleep(20 * time.Millisecond)
		// Try to write after timeout - should be discarded
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"late":"response"}`))
		close(handlerWriteAttempted)
	})

	middleware := Timeout(10 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	// Wait for handler's write attempt
	<-handlerWriteAttempted

	// Timeout response should be the only one
	assert.Equal(t, http.StatusGatewayTimeout, rec.Code)
	assert.NotContains(t, rec.Body.String(), "late")
}

func TestTimeout_ConcurrentWriteAttempts(t *testing.T) {
	t.Parallel()

	// Test that concurrent writes from multiple goroutines don't cause races
	var wg sync.WaitGroup
	writeCount := 10

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Spawn multiple goroutines trying to write concurrently
		for range writeCount {
			wg.Go(func() {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte("data"))
			})
		}
		wg.Wait()
	})

	middleware := Timeout(100 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	rec := httptest.NewRecorder()

	// Should not panic or race (run with -race flag)
	wrapped.ServeHTTP(rec, req)

	// One write should succeed
	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTimeoutWriter_WriteHeader_OnlyOnce(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	tw := &timeoutWriter{ResponseWriter: rec}

	tw.WriteHeader(http.StatusOK)
	tw.WriteHeader(http.StatusInternalServerError) // should be ignored

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestTimeoutWriter_Write_SetsWrittenFlag(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	tw := &timeoutWriter{ResponseWriter: rec}

	n, err := tw.Write([]byte("hello"))

	require.NoError(t, err)
	assert.Equal(t, 5, n)
	assert.True(t, tw.wroteHeader)
	assert.Equal(t, "hello", rec.Body.String())
}

func TestTimeoutWriter_Write_MultipleWritesAllowed(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	tw := &timeoutWriter{ResponseWriter: rec}

	// First write
	n1, err := tw.Write([]byte("first"))
	require.NoError(t, err)
	assert.Equal(t, 5, n1)

	// Second write should also succeed (not discarded)
	n2, err := tw.Write([]byte("second"))
	require.NoError(t, err)
	assert.Equal(t, 6, n2)
	assert.Equal(t, "firstsecond", rec.Body.String())
}

func TestTimeoutWriter_Write_AfterTimedOut_Discards(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	tw := &timeoutWriter{ResponseWriter: rec}

	// Simulate timeout having occurred
	tw.timedOut = true

	// Write after timeout should be discarded
	n, err := tw.Write([]byte("late data"))

	require.NoError(t, err)
	assert.Equal(t, 9, n) // returns len(b) even when discarded
	assert.Equal(t, "", rec.Body.String())
}

func TestTimeout_ContextCancelledNotDeadline(t *testing.T) {
	t.Parallel()

	// Test that we only write 504 for DeadlineExceeded, not other cancellations
	ctx, cancel := context.WithCancel(context.Background())

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Wait a bit then cancel externally
		time.Sleep(20 * time.Millisecond)
	})

	middleware := Timeout(100 * time.Millisecond)
	wrapped := middleware(handler)

	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/test", http.NoBody)
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()

	// Cancel context before timeout
	go func() {
		time.Sleep(10 * time.Millisecond)
		cancel()
	}()

	wrapped.ServeHTTP(rec, req)

	// Handler completes normally (before the 100ms timeout)
	// The external cancellation doesn't trigger the 504 path
	assert.NotEqual(t, http.StatusGatewayTimeout, rec.Code)
}
