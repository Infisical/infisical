package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/stretchr/testify/require"
)

// rotationFailed is the general payload of a rotation-failed webhook.
type rotationFailed struct {
	Event   string `json:"event"`
	Project struct {
		ProjectID         string `json:"projectId"`
		Environment       string `json:"environment"`
		SecretPath        string `json:"secretPath"`
		RotationName      string `json:"rotationName"`
		ErrorMessage      string `json:"errorMessage"`
		TriggeredManually bool   `json:"triggeredManually"`
	} `json:"project"`
}

func TestSecretRotation_Webhook(t *testing.T) {
	t.Parallel()

	t.Run("should send a rotation-failed webhook when a manual rotation fails", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		sink := fixture.NewWebhookSink(t, e.tn, webhook.Service)
		secretmanager.CreateWebhook(t, e.proj, "dev", "/", sink.URL)
		e.target.DropRole(t, e.users[1].name)

		// Action
		res := r.rotate(t)

		// Assert
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			var p rotationFailed
			return d.Decode(&p) == nil && p.Event == "secrets.rotation-failed"
		})
		var p rotationFailed
		require.NoError(t, got.Decode(&p))
		require.Equal(t, e.proj.ID, p.Project.ProjectID)
		require.Equal(t, "dev", p.Project.Environment)
		require.Equal(t, "/", p.Project.SecretPath)
		require.Equal(t, r.Name, p.Project.RotationName)
		require.True(t, p.Project.TriggeredManually)
		require.Equal(t, "Credential rotation failed. Check the rotation status in the dashboard for more details.",
			p.Project.ErrorMessage, "the provider's own error stays out of the webhook")
	})
}
