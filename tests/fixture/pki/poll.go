package pki

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// pollReadTimeout bounds one read, so one stuck response cannot use up the whole wait.
const pollReadTimeout = 10 * time.Second

// Poll reads until done holds and returns the last value read. read returns the decoded
// value with the response's status code and body. Transport errors, 429s and 5xx
// responses are retried; any other failed read ends the wait at once, including a 200
// that read could not decode, for which read returns the status and body with its error.
func Poll[T any](tt *testing.T, what string, read func(ctx context.Context) (T, int, []byte, error), done func(T) bool, opts ...wait.Option) T {
	tt.Helper()
	type outcome struct {
		v   T
		err error
	}
	got, err := wait.For(tt.Context(), func(ctx context.Context) (outcome, bool, error) {
		v, stop, err := pollOnce(ctx, what, read, done)
		if !stop {
			return outcome{}, false, err
		}
		return outcome{v: v, err: err}, true, err
	}, opts...)
	require.NoErrorf(tt, err, "waiting on %s", what)
	require.NoError(tt, got.err)
	return got.v
}

// pollOnce is one read of Poll. stop reports whether the wait ends, on done or on a
// failure retrying cannot clear; err is that failure, or the retried one.
func pollOnce[T any](ctx context.Context, what string, read func(ctx context.Context) (T, int, []byte, error), done func(T) bool) (v T, stop bool, err error) {
	ctx, cancel := context.WithTimeout(ctx, pollReadTimeout)
	defer cancel()
	v, status, body, err := read(ctx)
	if err != nil && status == http.StatusOK {
		return v, true, fmt.Errorf("%s returned an unexpected 200: %w: %s", what, err, apierr.Body(body))
	}
	if err != nil {
		return v, false, fmt.Errorf("%s: %w", what, err)
	}
	if status != http.StatusOK {
		temporary := status == http.StatusTooManyRequests || status >= 500
		return v, !temporary, fmt.Errorf("%s returned %d: %s", what, status, apierr.Body(body))
	}
	return v, done(v), nil
}

// ReadResponse does one read for Poll with a generated client's raw method and its Parse
// function. Unlike the WithResponse methods, it keeps the status and body when the body
// does not decode, so Poll ends the wait on a malformed 200 instead of retrying it.
func ReadResponse[R any](ctx context.Context, do func(context.Context) (*http.Response, error), parse func(*http.Response) (R, error)) (R, int, []byte, error) {
	var zero R
	res, err := do(ctx)
	if err != nil {
		return zero, 0, nil, err
	}
	body, err := io.ReadAll(res.Body)
	_ = res.Body.Close()
	if err != nil {
		return zero, 0, nil, err
	}
	res.Body = io.NopCloser(bytes.NewReader(body))
	parsed, err := parse(res)
	if err != nil {
		return zero, res.StatusCode, body, err
	}
	return parsed, res.StatusCode, body, nil
}
