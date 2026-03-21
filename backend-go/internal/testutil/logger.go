package testutil

import (
	"log/slog"
)

// NopLogger returns a logger that discards all output.
func NopLogger() *slog.Logger {
	return slog.New(slog.DiscardHandler)
}
