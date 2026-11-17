package fixture

import (
	"context"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// AuditEvent is one entry of an organization's audit log, narrowed to what a claim about it reads.
type AuditEvent struct {
	Type      string
	ActorType string
	Actor     map[string]any
	Metadata  map[string]any
}

// WaitForAuditEvents waits until the tenant's audit log holds at least n events of the type that match, and
// returns them. The log is written from a queue, so a read right after the action is usually empty.
func WaitForAuditEvents(tt *testing.T, tn *harness.Tenant, eventType string, n int, match func(AuditEvent) bool) []AuditEvent {
	tt.Helper()

	got, err := wait.For(tt.Context(), func(ctx context.Context) ([]AuditEvent, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: new(eventType),
			StartDate: new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second)),
			Limit:     new(float32(100)),
		})
		if err != nil || res.JSON200 == nil {
			return nil, false, err
		}
		var out []AuditEvent
		for _, l := range res.JSON200.AuditLogs {
			metadata, _ := l.Event.Metadata.(map[string]any)
			actor, _ := l.Actor.Metadata.(map[string]any)
			e := AuditEvent{Type: l.Event.Type, ActorType: l.Actor.Type, Actor: actor, Metadata: metadata}
			if match(e) {
				out = append(out, e)
			}
		}
		return out, len(out) >= n, nil
	})
	require.NoErrorf(tt, err, "waiting for %d %s audit events", n, eventType)
	return got
}
