package wait_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestFor(t *testing.T) {
	t.Run("should cut off a call still running at the deadline and keep the last error from a call that finished", func(t *testing.T) {
		// Setup
		calls := 0
		start := time.Now()

		// Action
		_, err := wait.For(t.Context(), func(ctx context.Context) (struct{}, bool, error) {
			calls++
			if calls == 1 {
				return struct{}{}, false, errors.New("not yet")
			}
			select {
			case <-ctx.Done():
				return struct{}{}, false, ctx.Err()
			case <-time.After(2 * time.Second):
				return struct{}{}, false, errors.New("not cut off at the deadline")
			}
		}, wait.Timeout(200*time.Millisecond), wait.Interval(10*time.Millisecond))

		// Assert
		require.ErrorIs(t, err, wait.ErrTimeout)
		require.ErrorContains(t, err, "not yet")
		require.NotErrorIs(t, err, context.DeadlineExceeded)
		require.Less(t, time.Since(start), time.Second)
	})

	t.Run("should keep a failure a call returns after the deadline that is not the cut-off itself", func(t *testing.T) {
		// Setup
		calls := 0

		// Action
		_, err := wait.For(t.Context(), func(ctx context.Context) (struct{}, bool, error) {
			calls++
			if calls == 1 {
				return struct{}{}, false, errors.New("not yet")
			}
			select {
			case <-ctx.Done():
			case <-time.After(2 * time.Second):
			}
			return struct{}{}, false, errors.New("forbidden")
		}, wait.Timeout(200*time.Millisecond), wait.Interval(10*time.Millisecond))

		// Assert
		require.ErrorIs(t, err, wait.ErrTimeout)
		require.ErrorContains(t, err, "forbidden")
	})
}
