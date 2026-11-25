package alerts_test

import (
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// Event alerts are dispatched by the event outbox relay after the change commits.
const alertDispatch = 30 * time.Second

func TestCertificateAlert_Delivery(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should email and post to Slack only the certificate issued in the alert's application", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The other application's certificate is issued first, so once the watched one is
			delivered on both channels, a delivery for it would normally have arrived too. A delivery
			that failed once is retried no sooner than about 30 seconds later and can land after this
			test stops watching, so the application filter itself is pinned by the unit tests of
			findEventTargets and findCertificatesByIds.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		unwatched := pki.NewApplication(t, g.Project, g.Profile)
		pki.EnableAPI(t, unwatched, g.Profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		slack := fixture.NewWebhookSink(t, tn, webhook.Slack)
		fixture.NewAlert(t, tn.Admin, map[string]any{
			"name": "issued", "resourceType": certManagerResource, "eventType": certManagerIssuance,
			"condition": map[string]any{"applicationIds": []string{g.App.ID.String()}},
			"channels": []map[string]any{
				{"name": "mail", "channelType": "email", "config": map[string]any{}, "recipients": []map[string]any{{"principalType": "user", "principalId": tn.Admin.ID.String()}}},
				{"name": "slack", "channelType": "slack", "config": map[string]any{"webhookUrl": slack.URL}},
			},
		})
		skipped, watched := id.Short()+".unwatched.test", id.Short()+".watched.test"
		pki.Issue(t, unwatched, g.Profile, pki.ServerCertificate(skipped))

		// Action
		g.Issue(t, pki.ServerCertificate(watched))

		// Assert
		inbox := tn.Mail(t)
		posted := slack.ExpectEvent[webhook.DeliveryReceived](t, nil, fakenet.Within(alertDispatch))
		require.Contains(t, posted.Body, watched)
		require.NotContains(t, posted.Body, skipped)
		mailed := inbox.ExpectEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(tn.Admin.Email) && strings.Contains(e.Message.Subject, "Alert")
		}, fakenet.Within(alertDispatch))
		require.Contains(t, mailed.Message.Body, watched)
		require.NotContains(t, mailed.Message.Body, skipped)
		slack.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
		inbox.ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return strings.Contains(e.Message.Subject, "Alert")
		})
	})
}
