package scheduled_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificateAutoRenewalJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should leave a certificate whose renew-before window has not opened", func(t *testing.T) {
		spec.Why(t, `The window cannot be opened through the API: setting it refuses a renewal date
			before tomorrow, and the job renews only certificates whose date is today or earlier.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".renewal.test"))
		res, err := g.Operator.API.UpdateCertificateRenewalConfigWithResponse(t.Context(), issued.ID, api.UpdateCertificateRenewalConfigJSONRequestBody{
			EnableAutoRenewal: new(true),
			RenewBeforeDays:   new(7),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "turning auto-renewal on returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Action
		runJob(t, h, api.CertificateV3AutoRenewal)

		// Assert
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.Nil(t, got.RenewedByCertificateId)
		require.Equal(t, "active", got.Status)
	})

	t.Run("should leave a certificate with auto-renewal off", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".renewal.test"))

		// Action
		runJob(t, h, api.CertificateV3AutoRenewal)

		// Assert
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.Nil(t, got.RenewBeforeDays)
		require.Nil(t, got.RenewedByCertificateId)
		require.Equal(t, "active", got.Status)
	})
}
