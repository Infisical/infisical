package logutil

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/requestid"
	"github.com/infisical/api/internal/services/auth"
)

// ContextHandler wraps an slog.Handler and enriches every log record
// with values extracted from the context (e.g. request ID, identity info).
type ContextHandler struct {
	inner slog.Handler
}

// NewContextHandler returns a handler that automatically adds the request ID,
// identity info (orgId, actorType, actorId), and any future context values to every log record.
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

	// Add identity info if available (set by RequireAuth middleware)
	if identity, err := auth.IdentityFromContext(ctx); err == nil && identity != nil {
		if identity.OrgID != uuid.Nil {
			r.AddAttrs(slog.String("orgId", identity.OrgID.String()))
		}
		r.AddAttrs(
			slog.String("actorType", string(identity.Actor)),
			slog.String("actorId", identity.ActorID.String()),
		)
	}

	return h.inner.Handle(ctx, r)
}

func (h *ContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &ContextHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *ContextHandler) WithGroup(name string) slog.Handler {
	return &ContextHandler{inner: h.inner.WithGroup(name)}
}
