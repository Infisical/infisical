package alerts_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	applicationResource = "cert-manager.application"
	applicationIssuance = "cert-manager.application.certificate.issuance"
	certManagerResource = "cert-manager"
	certManagerIssuance = "cert-manager.certificate.issuance"
)

// applicationIssuanceAlert creates an issuance alert on one application that posts
// to a webhook at url.
func applicationIssuanceAlert(t *testing.T, actor *harness.Principal, app pki.Application, url string) uuid.UUID {
	t.Helper()
	return fixture.NewAlert(t, actor, map[string]any{
		"name":         "issued-" + id.Short(),
		"resourceType": applicationResource,
		"resourceId":   app.ID.String(),
		"eventType":    applicationIssuance,
		"channels":     []map[string]any{fixture.WebhookChannel(url)},
	})
}

// readAlert reads an alert as actor and returns the response, whatever its status.
func readAlert(t *testing.T, actor *harness.Principal, alertID uuid.UUID) *api.GetAlertByIdResponse {
	t.Helper()
	res, err := actor.API.GetAlertByIdWithResponse(t.Context(), alertID)
	require.NoError(t, err)
	return res
}

// requireAlert reads an alert as actor and requires it to exist.
func requireAlert(t *testing.T, actor *harness.Principal, alertID uuid.UUID) *api.GetAlertByIdResponse {
	t.Helper()
	res := readAlert(t, actor, alertID)
	require.NotNilf(t, res.JSON200, "reading the alert returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// requireNoAlert requires reading the alert as actor to answer the alert lookup's own
// 404, so a 404 from resolving a deleted application cannot pass for a removed alert.
func requireNoAlert(t *testing.T, actor *harness.Principal, alertID uuid.UUID) {
	t.Helper()
	res := readAlert(t, actor, alertID)
	require.Equalf(t, http.StatusNotFound, res.StatusCode(), "reading the alert answered: %s", apierr.Body(res.Body))
	require.Equal(t, fmt.Sprintf("Alert with ID '%s' not found", alertID), apierr.Message(res.Body))
}
