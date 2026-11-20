package webhooks_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// importBudget covers two queue hops: the source folder's sync job finds the import
// and queues one for the importing folder, and each hop has its own debounce and
// delivery delay.
var importBudget = fakenet.Within(30 * time.Second)

func TestWebhook_Delivery(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should deliver once per change and record success", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL)
		require.Nil(t, getHook(t, proj, id).LastStatus, "a new webhook reports a run")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		require.Equal(t, http.MethodPost, got.Method)
		require.Equal(t, proj.ID, decodeGeneral(t, got.Delivery).Project.ProjectID)
		ran := awaitRun(t, proj, id)
		require.Equal(t, "success", *ran.LastStatus)
		require.Nil(t, ran.LastRunErrorMessage)
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})

	t.Run("should deliver for /** but not / on a subfolder change, and not for another environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		recursive := fixture.NewWebhookSink(t, tn, webhook.Service)
		root := fixture.NewWebhookSink(t, tn, webhook.Service)
		staging := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, recursive.URL, atPath("/**"))
		newHook(t, proj, root.URL, atPath("/"))
		newHook(t, proj, staging.URL, inEnv("staging"), atPath("/**"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))

		// Assert
		got := recursive.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		require.Equal(t, "/app", decodeGeneral(t, got.Delivery).Project.SecretPath)
		root.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
		staging.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})

	t.Run("should skip a disabled hook and a hook whose filter leaves the event out", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		control := fixture.NewWebhookSink(t, tn, webhook.Service)
		disabled := fixture.NewWebhookSink(t, tn, webhook.Service)
		filtered := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, control.URL)
		disable(t, proj, newHook(t, proj, disabled.URL))
		newHook(t, proj, filtered.URL,
			onlyEvents(api.CreateWebhookJSONBodyEventsFilterEventNameSecretsChangeRequestModified))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		control.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		disabled.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
		filtered.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})

	t.Run("should deliver when the filter names the event", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, sink.URL, onlyEvents(api.CreateWebhookJSONBodyEventsFilterEventNameSecretsModified))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
	})

	t.Run("should send the documented general payload", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithPrincipalName("writer"), fixture.WithRoles("member"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, sink.URL)
		before := time.Now().Add(-time.Minute).UnixMilli()

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.As(member))

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		require.Equal(t, "application/json", contentType(got.Delivery))
		p := decodeGeneral(t, got.Delivery)
		require.Equal(t, proj.ID, p.Project.WorkspaceID)
		require.Equal(t, proj.ID, p.Project.ProjectID)
		require.Equal(t, proj.Name, p.Project.ProjectName)
		require.Equal(t, "dev", p.Project.Environment)
		require.Equal(t, "Development", p.Project.EnvironmentName)
		require.Equal(t, "/", p.Project.SecretPath)
		require.Equal(t, member.Email, p.Project.ChangedBy)
		require.Equal(t, "user", p.Project.ChangedByActorType)
		require.Greater(t, p.Timestamp, before)
	})

	t.Run("should send a Slack card with the change details", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Slack)
		id := newHook(t, proj, sink.URL, slackType())

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil)
		require.Equalf(t, http.StatusOK, got.Status, "Slack refused the card: %s", got.Body)
		var card slackCard
		require.NoError(t, got.Decode(&card))
		require.Equal(t, "A secret value has been added or modified.", card.Text)
		require.Len(t, card.Attachments, 1)
		require.Equal(t, map[string]string{
			"Project":                proj.Name,
			"Environment":            "dev",
			"Environment Name":       "Development",
			"Secret Path":            "/",
			"Modified By":            tn.Admin.Email,
			"Modified By Actor Type": "user",
		}, card.attachment(0))
		require.Equal(t, "success", *awaitRun(t, proj, id).LastStatus)
	})

	t.Run("should sign the body with x-infisical-signature as HMAC-SHA256 of the secret key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, sink.URL, signedWith("signing-key"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		mac := hmac.New(sha256.New, []byte("signing-key"))
		mac.Write([]byte(got.Body))
		want := fmt.Sprintf("t=%d;%s", decodeGeneral(t, got.Delivery).Timestamp, hex.EncodeToString(mac.Sum(nil)))
		require.Equal(t, want, got.Header.Get("X-Infisical-Signature"))
	})

	t.Run("should send no signature when the hook has no secret key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, sink.URL)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		require.Empty(t, got.Header.Values("X-Infisical-Signature"))
	})

	t.Run("should fire on the importing path when an imported folder changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/shared")
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newHook(t, proj, sink.URL, atPath("/app"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/shared"},
			secretmanager.IntoPath("/app"))
		sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified), importBudget)
		mark := sink.Mark(t)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "SHARED_KEY", "value", secretmanager.WithPath("/shared"))

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified), importBudget, fakenet.Since(mark))
		require.Equal(t, "/app", decodeGeneral(t, got.Delivery).Project.SecretPath)
	})
}

func contentType(d webhook.Delivery) string {
	ct, _, _ := strings.Cut(d.Header.Get("Content-Type"), ";")
	return strings.TrimSpace(ct)
}

type slackCard struct {
	Text        string `json:"text"`
	Attachments []struct {
		Fields []struct {
			Title string `json:"title"`
			Value string `json:"value"`
		} `json:"fields"`
	} `json:"attachments"`
}

func (c slackCard) attachment(i int) map[string]string {
	out := map[string]string{}
	for _, f := range c.Attachments[i].Fields {
		out[f.Title] = f.Value
	}
	return out
}
