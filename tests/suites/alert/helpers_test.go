package alert_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	identityAuthentication = "identity.authentication"
	authMethodChanged      = "identity.authentication.auth-method-changed"
	authExpiry             = "identity.authentication.expiry"
)

// alertBody is a create request. Sent as raw JSON so a test can send what the typed
// body would refuse to express, such as an empty channel list.
type alertBody struct {
	Name         string    `json:"name"`
	ResourceType string    `json:"resourceType"`
	ResourceID   string    `json:"resourceId,omitempty"`
	EventType    string    `json:"eventType"`
	Condition    any       `json:"condition,omitempty"`
	Channels     []channel `json:"channels"`
}

type channel struct {
	Name        string         `json:"name"`
	ChannelType string         `json:"channelType"`
	Config      map[string]any `json:"config"`
}

func webhookChannel(url string) channel {
	return channel{Name: "hook", ChannelType: "webhook", Config: map[string]any{"url": url}}
}

func createAlert(t *testing.T, actor *harness.Principal, body alertBody) *api.CreateAlertResponse {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	res, err := actor.API.CreateAlertWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

func newAlert(t *testing.T, actor *harness.Principal, body alertBody) uuid.UUID {
	t.Helper()
	res := createAlert(t, actor, body)
	require.NotNilf(t, res.JSON200, "creating alert %s returned %d: %s", body.Name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Alert.Id
}

func alertsOn(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.ListAlertsWithResponse(t.Context(), &api.ListAlertsParams{
		ResourceType: identityAuthentication,
		ResourceId:   &identityID,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing alerts: %s", apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, a := range res.JSON200.Alerts {
		out = append(out, a.Id)
	}
	return out
}

// alertDelivery is the CloudEvents envelope a webhook channel posts.
type alertDelivery struct {
	Type    string `json:"type"`
	Subject string `json:"subject"`
	Data    struct {
		Alert struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			ResourceType string `json:"resourceType"`
		} `json:"alert"`
		Items []struct {
			Title  string `json:"title"`
			Fields []struct {
				Label string `json:"label"`
				Value string `json:"value"`
			} `json:"fields"`
		} `json:"items"`
	} `json:"data"`
}

func fieldsOf(t *testing.T, d alertDelivery) map[string]string {
	t.Helper()
	require.Len(t, d.Data.Items, 1)
	out := map[string]string{}
	for _, f := range d.Data.Items[0].Fields {
		out[f.Label] = f.Value
	}
	return out
}

func addClientSecret(t *testing.T, tn *harness.Tenant, identity *harness.Principal, description string) {
	t.Helper()
	res, err := tn.Admin.API.CreateUniversalAuthClientSecretWithResponse(t.Context(), identity.ID.String(),
		api.CreateUniversalAuthClientSecretJSONRequestBody{Description: &description})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "adding a client secret: %s", apierr.Body(res.Body))
}
