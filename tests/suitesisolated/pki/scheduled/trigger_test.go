package scheduled_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCronJobTrigger(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse an organization admin and run nothing", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate(id.Short()+".expiring.test"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		fixture.NewCertificateExpiryAlert(t, tn.Admin, g.App.ID, "60d", sink.URL)

		// Action
		res, err := tn.Admin.API.TriggerAdminCronJobWithResponse(t.Context(), api.DailyAlertProcessing)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered %s", apierr.Body(res.Body))
		require.Equal(t, "Requires elevated super admin privileges", apierr.Message(res.Body))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil, fakenet.Within(10*time.Second))
	})
}
