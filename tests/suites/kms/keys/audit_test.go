package keys_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

type auditEvent struct {
	Type      string
	ActorType string
	Actor     map[string]any
	Metadata  map[string]any
}

// keyEvents waits until the organization's audit log holds at least n events of the type for the key. The log is
// written from a queue, so a read right after the action is empty.
func keyEvents(t *testing.T, tn *harness.Tenant, eventType, keyID string, n int) []auditEvent {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) ([]auditEvent, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: new(eventType),
			StartDate: new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second)),
			Limit:     new(float32(100)),
		})
		if err != nil || res.JSON200 == nil {
			return nil, false, err
		}
		var out []auditEvent
		for _, l := range res.JSON200.AuditLogs {
			metadata, _ := l.Event.Metadata.(map[string]any)
			if metadata["keyId"] != keyID {
				continue
			}
			actor, _ := l.Actor.Metadata.(map[string]any)
			out = append(out, auditEvent{Type: l.Event.Type, ActorType: l.Actor.Type, Actor: actor, Metadata: metadata})
		}
		return out, len(out) >= n, nil
	})
	require.NoErrorf(t, err, "waiting for %d %s audit events for key %s", n, eventType, keyID)
	return got
}

func TestKmsKey_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record key creation, private key export and deletion with the actor and the key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)

		// Action
		key := kms.NewKey(t, proj)
		kms.ExportPrivateKey(t, proj, key.ID)
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		for _, eventType := range []string{"create-cmek", "cmek-get-private-key", "delete-cmek"} {
			events := keyEvents(t, tn, eventType, key.ID.String(), 1)
			require.Lenf(t, events, 1, "%s", eventType)
			require.Equalf(t, "user", events[0].ActorType, "%s", eventType)
			require.Equalf(t, tn.Admin.ID.String(), events[0].Actor["userId"], "%s", eventType)
		}
	})

	t.Run("should not record a refused deletion as a deletion", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		refused, err := viewer.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, refused.StatusCode(), "%s", apierr.Body(refused.Body))

		// Action
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		spec.Why(t, "the refused delete came first, so once the admin's delete is logged a recorded refusal would be too")
		events := keyEvents(t, tn, "delete-cmek", key.ID.String(), 1)
		require.Len(t, events, 1)
		require.Equal(t, "user", events[0].ActorType)
	})
}
