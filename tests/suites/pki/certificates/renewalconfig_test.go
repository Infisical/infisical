package certificates_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificate_RenewalConfig(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep the renew-before window it was given and preview the renewal from the original request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".autorenew.test"
		issued := g.Issue(t, pki.ServerCertificate(name))

		// Action
		res, err := g.Operator.API.UpdateCertificateRenewalConfigWithResponse(t.Context(), issued.ID, api.UpdateCertificateRenewalConfigJSONRequestBody{
			EnableAutoRenewal: new(true),
			RenewBeforeDays:   new(7),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating the renewal config returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, new(float32(7)), pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate.RenewBeforeDays)
		preview, err := g.Operator.API.GetCertificateRenewalPreviewWithResponse(t.Context(), issued.ID)
		require.NoError(t, err)
		require.NotNilf(t, preview.JSON200, "previewing the renewal returned %d: %s", preview.StatusCode(), apierr.Body(preview.Body))
		require.Equal(t, &name, preview.JSON200.Request.CommonName)
	})

	t.Run("should refuse a renew-before window over 30 days and keep auto-renewal off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".autorenew.test"))

		// Action
		res, err := g.Operator.API.UpdateCertificateRenewalConfigWithResponse(t.Context(), issued.ID, api.UpdateCertificateRenewalConfigJSONRequestBody{
			EnableAutoRenewal: new(true),
			RenewBeforeDays:   new(40),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), `"path":["renewBeforeDays"]`)
		require.Contains(t, string(res.Body), "Number must be less than or equal to 30")
		require.Nil(t, pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate.RenewBeforeDays)
	})

	t.Run("should give certificates issued through API enrollment the enrollment's renew-before window", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		pki.EnableAPI(t, g.App, g.Profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{
			AutoRenew:       new(true),
			RenewBeforeDays: new(10),
		})

		// Action
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".enrollment.test"))

		// Assert
		require.Equal(t, new(float32(10)), pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate.RenewBeforeDays)
	})
}
