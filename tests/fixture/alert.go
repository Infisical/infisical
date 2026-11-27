package fixture

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// NewCertificateExpiryAlert creates, as actor, a certificate expiry alert on one application
// that warns alertBefore ahead (such as "14d") and posts to a webhook at webhookURL.
func NewCertificateExpiryAlert(tt *testing.T, actor *harness.Principal, applicationID uuid.UUID, alertBefore, webhookURL string) uuid.UUID {
	tt.Helper()
	return NewAlert(tt, actor, map[string]any{
		"name":         "expiring-" + id.Short(),
		"resourceType": "cert-manager",
		"eventType":    "cert-manager.certificate.expiry",
		"condition":    map[string]any{"alertBefore": alertBefore, "applicationIds": []string{applicationID.String()}},
		"channels":     []map[string]any{WebhookChannel(webhookURL)},
	})
}

// NewAlert creates, as actor, an alert from a raw JSON body, since its condition and
// channel configs depend on the resource type, and returns its id.
func NewAlert(tt *testing.T, actor *harness.Principal, body map[string]any) uuid.UUID {
	tt.Helper()
	raw, err := json.Marshal(body)
	require.NoError(tt, err)
	res, err := actor.API.CreateAlertWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "creating alert %v returned %d: %s", body["name"], res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Alert.Id
}

// WebhookChannel is an alert channel that posts to a webhook at url.
func WebhookChannel(url string) map[string]any {
	return map[string]any{"name": "hook", "channelType": "webhook", "config": map[string]any{"url": url}}
}
