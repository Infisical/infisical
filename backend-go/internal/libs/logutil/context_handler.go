package logutil

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/libs/requestid"
)

// ContextHandler wraps an slog.Handler and enriches every log record
// with values extracted from the context (e.g. request ID).
type ContextHandler struct {
	inner slog.Handler
}

// NewContextHandler returns a handler that automatically adds the request ID
// (and any future context values) to every log record.
func NewContextHandler(inner slog.Handler) *ContextHandler {
	return &ContextHandler{inner: inner}
}

func (h *ContextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *ContextHandler) Handle(ctx context.Context, r slog.Record) error { //nolint:gocritic // slog.Handler interface requires value receiver
	if reqID := requestid.FromContext(ctx); reqID != "" {
		r.AddAttrs(slog.String("reqId", reqID))
	}

	return h.inner.Handle(ctx, r)
}

func (h *ContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &ContextHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *ContextHandler) WithGroup(name string) slog.Handler {
	return &ContextHandler{inner: h.inner.WithGroup(name)}
}
