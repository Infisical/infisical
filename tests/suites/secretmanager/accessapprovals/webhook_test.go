package accessapprovals_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/stretchr/testify/require"
)

// accessRequestEvent is the general payload of an access-request webhook.
type accessRequestEvent struct {
	Event   string `json:"event"`
	Action  string `json:"action"`
	Project struct {
		ID string `json:"id"`
	} `json:"project"`
	Request struct {
		ID         string `json:"id"`
		Status     string `json:"status"`
		IsBypassed bool   `json:"isBypassed"`
		Policy     struct {
			ID                    string `json:"id"`
			Name                  string `json:"name"`
			HasSequencedApprovers bool   `json:"hasSequencedApprovers"`
		} `json:"policy"`
		RequestedAccess struct {
			Target struct {
				Environment struct {
					Slug string `json:"slug"`
				} `json:"environment"`
				SecretPath string `json:"secretPath"`
			} `json:"target"`
			IsTemporary bool `json:"isTemporary"`
			Permissions []struct {
				Subject string   `json:"subject"`
				Actions []string `json:"actions"`
			} `json:"permissions"`
		} `json:"requestedAccess"`
		RequestedBy struct {
			Type string `json:"type"`
			ID   string `json:"id"`
		} `json:"requestedBy"`
		ApprovedAt *string `json:"approvedAt"`
		RevokedAt  *string `json:"revokedAt"`
	} `json:"request"`
}

func TestAccessApprovalRequest_Webhook(t *testing.T) {
	t.Parallel()

	t.Run("should notify a webhook with the request details when a request opens", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		sink := fixture.NewWebhookSink(t, g.tn, webhook.Service)
		secretmanager.CreateWebhook(t, g.proj, "dev", "/", sink.URL)

		// Action
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			var p accessRequestEvent
			return d.Decode(&p) == nil && p.Event == "secrets.access-request.modified" && p.Request.ID == requestID
		})
		var p accessRequestEvent
		require.NoError(t, got.Decode(&p))
		require.Equal(t, "created", p.Action)
		require.Equal(t, g.proj.ID, p.Project.ID)
		require.Equal(t, "pending", p.Request.Status)
		require.False(t, p.Request.IsBypassed)
		require.Equal(t, g.policyID, p.Request.Policy.ID)
		require.Equal(t, mustGetPolicy(t, g.proj, g.policyID).Name, p.Request.Policy.Name)
		require.False(t, p.Request.Policy.HasSequencedApprovers)
		require.Equal(t, "dev", p.Request.RequestedAccess.Target.Environment.Slug)
		require.Equal(t, guardedPath, p.Request.RequestedAccess.Target.SecretPath)
		require.False(t, p.Request.RequestedAccess.IsTemporary)
		require.Len(t, p.Request.RequestedAccess.Permissions, 1)
		require.Equal(t, "secrets", p.Request.RequestedAccess.Permissions[0].Subject)
		require.Equal(t, []string{"read"}, p.Request.RequestedAccess.Permissions[0].Actions)
		require.Equal(t, "user", p.Request.RequestedBy.Type)
		require.Equal(t, g.requester.ID.String(), p.Request.RequestedBy.ID)
		require.Nil(t, p.Request.ApprovedAt)
		require.Nil(t, p.Request.RevokedAt)
	})
}
