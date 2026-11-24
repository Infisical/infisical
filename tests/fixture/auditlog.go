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

// RequireAuditedBy requires the single audit event of the type whose metadata holds value under key,
// such as a CA's "caId", and requires it to name the user as its actor. It returns the event's metadata.
func RequireAuditedBy(tt *testing.T, tn *harness.Tenant, user *harness.Principal, eventType, key, value string) map[string]any {
	tt.Helper()
	events := WaitForAuditEvents(tt, tn, eventType, 1, func(e AuditEvent) bool { return e.Metadata[key] == value })
	require.Lenf(tt, events, 1, "%s audit events about %s %s", eventType, key, value)
	require.Equalf(tt, "user", events[0].ActorType, "%s actor type", eventType)
	require.Equalf(tt, user.ID.String(), events[0].Actor["userId"], "%s actor", eventType)
	return events[0].Metadata
}
