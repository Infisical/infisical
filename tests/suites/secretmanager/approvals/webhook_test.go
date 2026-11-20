package approvals_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/stretchr/testify/require"
)

// changeRequestEvent is the general payload of a change-request webhook.
type changeRequestEvent struct {
	Event   string `json:"event"`
	Action  string `json:"action"`
	Project struct {
		ID string `json:"id"`
	} `json:"project"`
	Request struct {
		ID        string `json:"id"`
		Status    string `json:"status"`
		HasMerged bool   `json:"hasMerged"`
		Policy    struct {
			ID string `json:"id"`
		} `json:"policy"`
		RequestedBy struct {
			ID string `json:"id"`
		} `json:"requestedBy"`
		Target struct {
			Environment struct {
				Slug string `json:"slug"`
			} `json:"environment"`
			SecretPath string `json:"secretPath"`
		} `json:"target"`
	} `json:"request"`
}

// changeRequestAction waits for the delivery of one action on a request.
func changeRequestAction(t *testing.T, sink *fixture.WebhookSink, requestID, action string) changeRequestEvent {
	t.Helper()
	got := sink.ExpectEvent[webhook.DeliveryReceived](t, func(e webhook.DeliveryReceived) bool {
		var p changeRequestEvent
		return e.Decode(&p) == nil && p.Event == "secrets.change-request.modified" &&
			p.Request.ID == requestID && p.Action == action
	})
	var p changeRequestEvent
	require.NoError(t, got.Decode(&p))
	return p
}

func TestSecretApprovalRequest_Webhook(t *testing.T) {
	t.Parallel()

	t.Run("should notify a webhook on create, review and merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		sink := fixture.NewWebhookSink(t, p.tn, webhook.Service)
		secretmanager.CreateWebhook(t, p.proj, "dev", "/", sink.URL)

		// Action
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		approve(t, p.reviewer, held.ID)
		merge(t, p.committer, held.ID)

		// Assert
		id := held.ID.String()
		created := changeRequestAction(t, sink, id, "created")
		require.Equal(t, p.proj.ID, created.Project.ID)
		require.Equal(t, p.policyID.String(), created.Request.Policy.ID)
		require.Equal(t, p.committer.ID.String(), created.Request.RequestedBy.ID)
		require.Equal(t, "dev", created.Request.Target.Environment.Slug)
		require.Equal(t, "/", created.Request.Target.SecretPath)
		require.False(t, created.Request.HasMerged)
		changeRequestAction(t, sink, id, "reviewed")
		merged := changeRequestAction(t, sink, id, "merged")
		require.True(t, merged.Request.HasMerged)
	})
}
