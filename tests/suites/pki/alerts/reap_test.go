package alerts_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func deleteApplication(t *testing.T, tn *harness.Tenant, app pki.Application) {
	t.Helper()
	res, err := tn.Admin.API.DeletePkiApplicationWithResponse(t.Context(), app.ID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the application: %s", apierr.Body(res.Body))
}

func TestAlertReaping(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the application's alerts and keep another application's when the application is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		deleted, kept := pki.NewApplication(t, proj), pki.NewApplication(t, proj)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		gone := applicationIssuanceAlert(t, tn.Admin, deleted, sink.URL)
		control := applicationIssuanceAlert(t, tn.Admin, kept, sink.URL)
		before := requireAlert(t, tn.Admin, control).JSON200.Alert

		// Action
		deleteApplication(t, tn, deleted)

		// Assert
		requireNoAlert(t, tn.Admin, gone)
		require.Equal(t, before, requireAlert(t, tn.Admin, control).JSON200.Alert)
	})
}

func TestAlertReaping_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a Certificate Manager alert scoped to the application when the application is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, tn.Admin, app.ID, "14d", sink.URL)

		// Action
		deleteApplication(t, tn, app)

		// Assert
		requireNoAlert(t, tn.Admin, alertID)
	})
}
