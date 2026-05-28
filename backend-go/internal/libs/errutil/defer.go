package errutil

import (
	"context"
	"log/slog"
)

// DeferErr calls fn and logs any returned error at ERROR level.
// Intended for use in defer statements for cleanup functions like
// Rollback, Close, or Unlock where the error is not actionable by the caller.
//
//	defer errutil.DeferErr(ctx, lock.Rollback, "rolling back lock")
func DeferErr(ctx context.Context, fn func() error, msg string) {
	if err := fn(); err != nil {
		slog.ErrorContext(ctx, msg, "error", err)
	}
}
