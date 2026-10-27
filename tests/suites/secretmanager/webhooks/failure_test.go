package webhooks_test

import (
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// noRetryWindow is longer than the queue's first 3 s backoff, so a job that threw and
// was retried would deliver inside it.
var noRetryWindow = fakenet.Within(10 * time.Second)

func TestWebhook_Failure(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record failed with the error message when the sink answers 500", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Seed(t, webhook.Respond(http.StatusInternalServerError))
		id := newHook(t, proj, sink.URL)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		require.Equal(t, http.StatusInternalServerError, got.Status)
		ran := awaitRun(t, proj, id)
		require.Equal(t, "failed", *ran.LastStatus)
		require.NotNil(t, ran.LastRunErrorMessage)
		require.Equal(t, "Request failed with status code 500", *ran.LastRunErrorMessage)
	})

	t.Run("should send a delivery four times when the sink answers 500, then record failed and stop", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The HTTP client retries a 5xx three times. The delivery job then settles every
			hook and never throws, so the queue's own five attempts never apply. Pinned as today's
			contract: a receiver that is down for a few seconds misses the event.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Seed(t, webhook.Respond(http.StatusInternalServerError))
		id := newHook(t, proj, sink.URL)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		for range 4 {
			sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		}
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil, noRetryWindow)
		require.Equal(t, "failed", *awaitRun(t, proj, id).LastStatus)
	})

	t.Run("should send a delivery once when the sink refuses it with 400", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Seed(t, webhook.Respond(http.StatusBadRequest))
		id := newHook(t, proj, sink.URL)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil, noRetryWindow)
		ran := awaitRun(t, proj, id)
		require.Equal(t, "failed", *ran.LastStatus)
		require.Equal(t, "Request failed with status code 400", *ran.LastRunErrorMessage)
	})

	t.Run("should record success and clear the error once the sink recovers", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Seed(t, webhook.Respond(http.StatusBadRequest))
		id := newHook(t, proj, sink.URL)
		failed := testHook(t, tn.Admin, id)
		require.Equalf(t, http.StatusOK, failed.StatusCode(), "%s", apierr.Body(failed.Body))
		require.Equal(t, "failed", *decodeHook(t, failed.Body).LastStatus)
		sink.Seed(t, webhook.Respond(http.StatusOK))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		sink.ExpectEvent[webhook.DeliveryReceived](t, event(secretModified))
		wait.Until(t, "the webhook to record a successful run", func() bool {
			got := getHook(t, proj, id)
			return got.LastStatus != nil && *got.LastStatus == "success"
		})
		require.Nil(t, getHook(t, proj, id).LastRunErrorMessage)
	})
}

func TestWebhook_Test(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should deliver a test event and report success", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		id := newHook(t, proj, sink.URL, atPath("/app"))

		// Action
		res := testHook(t, tn.Admin, id)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "success", *decodeHook(t, res.Body).LastStatus)
		require.Equal(t, "success", *getHook(t, proj, id).LastStatus)
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, event("test"))
		p := decodeGeneral(t, got.Delivery)
		require.Equal(t, proj.ID, p.Project.ProjectID)
		require.Equal(t, proj.Name, p.Project.ProjectName)
		require.Equal(t, "dev", p.Project.Environment)
		require.Equal(t, "/app", p.Project.SecretPath)
	})

	t.Run("should send the test event four times and report failed with the error message when the sink answers 503", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Fail(t, "POST", "*", http.StatusServiceUnavailable)
		id := newHook(t, proj, sink.URL)

		// Action
		res := testHook(t, tn.Admin, id)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := getHook(t, proj, id)
		require.Equal(t, "failed", *got.LastStatus)
		require.NotNil(t, got.LastRunErrorMessage)
		require.Equal(t, "Request failed with status code 503", *got.LastRunErrorMessage)
		require.Equal(t, 4, sink.Received(t, "POST", sinkPath(t, sink)), "one attempt and the HTTP client's three retries")
	})

	t.Run("should send a Slack test message that Slack accepts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Slack)
		id := newHook(t, proj, sink.URL, slackType())

		// Action
		res := testHook(t, tn.Admin, id)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "success", *decodeHook(t, res.Body).LastStatus)
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil)
		var card slackCard
		require.NoError(t, got.Decode(&card))
		require.Equal(t, "This is a test message from Infisical webhooks.", card.Text)
		require.Equal(t, proj.Name, card.attachment(0)["Project"])
	})
}

// sinkPath is the path a delivery to the sink arrives on, as fakenet's call log
// records it.
func sinkPath(t *testing.T, sink *fixture.WebhookSink) string {
	t.Helper()
	u, err := url.Parse(sink.URL)
	require.NoError(t, err)
	return u.Path
}
