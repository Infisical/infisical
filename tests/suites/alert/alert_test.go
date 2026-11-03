package alert_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Event alerts are dispatched by the event outbox relay after the change commits.
const alertDispatch = 30 * time.Second

func TestAlert_AuthMethodChanged(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should post the change to the webhook when a client secret is added to the identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := newAlert(t, tn.Admin, alertBody{
			Name: "auth changes", ResourceType: identityAuthentication, ResourceID: bot.ID.String(),
			EventType: authMethodChanged, Channels: []channel{webhookChannel(sink.URL)},
		})

		// Action
		addClientSecret(t, tn, bot, "ci-deploy")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil, fakenet.Within(alertDispatch))
		require.Equal(t, http.MethodPost, got.Method)
		var d alertDelivery
		require.NoError(t, json.Unmarshal([]byte(got.Body), &d), got.Body)
		require.Equal(t, "com.infisical.identity.authentication.auth-method-changed", d.Type)
		require.Equal(t, authMethodChanged, d.Subject)
		require.Equal(t, alertID.String(), d.Data.Alert.ID)
		require.Equal(t, bot.Name, d.Data.Items[0].Title)
		fields := fieldsOf(t, d)
		require.Equal(t, "Universal Auth", fields["Auth Method"])
		require.Equal(t, "Credential Added", fields["Change"])
		require.Equal(t, "ci-deploy", fields["Credential"])
		require.Equal(t, tn.Admin.Email+" (user)", fields["Changed By"])
	})

	t.Run("should not post a change to another identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		watched := tn.NewMachineIdentity(t)
		other := tn.NewMachineIdentity(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newAlert(t, tn.Admin, alertBody{
			Name: "auth changes", ResourceType: identityAuthentication, ResourceID: watched.ID.String(),
			EventType: authMethodChanged, Channels: []channel{webhookChannel(sink.URL)},
		})

		// Action
		addClientSecret(t, tn, other, "unwatched")
		addClientSecret(t, tn, watched, "watched")

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil, fakenet.Within(alertDispatch))
		require.Contains(t, got.Body, watched.Name)
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			return strings.Contains(d.Body, other.Name)
		})
	})
}

func TestAlert_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a second alert for the same resource and event and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		body := alertBody{
			Name: "auth changes", ResourceType: identityAuthentication, ResourceID: bot.ID.String(),
			EventType: authMethodChanged, Channels: []channel{webhookChannel(sink.URL)},
		}
		first := newAlert(t, tn.Admin, body)
		body.Name = "auth changes again"

		// Action
		res := createAlert(t, tn.Admin, body)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "An alert for this resource and event already exists", res.JSON400.Message)
		require.Equal(t, []uuid.UUID{first}, alertsOn(t, tn, bot.ID))
	})

	t.Run("should refuse an alert with no channels and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t)

		// Action
		res := createAlert(t, tn.Admin, alertBody{
			Name: "silent", ResourceType: identityAuthentication, ResourceID: bot.ID.String(),
			EventType: authMethodChanged, Channels: []channel{},
		})

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "channels")
		require.Empty(t, alertsOn(t, tn, bot.ID))
	})

	t.Run("should refuse an expiry alert warning more than 90 days ahead and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		res := createAlert(t, tn.Admin, alertBody{
			Name: "expiry", ResourceType: identityAuthentication, ResourceID: bot.ID.String(),
			EventType: authExpiry, Condition: map[string]any{"alertBefore": "91d"},
			Channels: []channel{webhookChannel(sink.URL)},
		})

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Invalid alert condition: Must be a whole number of days from 1d to 90d, e.g. '30d'", res.JSON400.Message)
		require.Empty(t, alertsOn(t, tn, bot.ID))
	})

	t.Run("should keep an expiry alert's lead time and channel", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		alertID := newAlert(t, tn.Admin, alertBody{
			Name: "expiry", ResourceType: identityAuthentication, ResourceID: bot.ID.String(),
			EventType: authExpiry, Condition: map[string]any{"alertBefore": "7d"},
			Channels: []channel{webhookChannel(sink.URL)},
		})

		// Assert
		got, err := tn.Admin.API.GetAlertByIdWithResponse(t.Context(), alertID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the alert returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "scheduled", got.JSON200.Alert.TriggerType)
		require.Equal(t, map[string]any{"alertBefore": "7d"}, got.JSON200.Alert.Condition)
		require.Len(t, got.JSON200.Alert.Channels, 1)
		require.Equal(t, sink.URL, got.JSON200.Alert.Channels[0].Config["url"])
	})
}
