package externalca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestAzureADCSCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew by submitting a new request under the profile's template", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		adcs.Seed(t, azureadcs.WithTemplates("HarnessWebServer"))
		o := orderIssuerOn(t, proj, azureADCSProfile(t, tn, proj, ca, "HarnessWebServer"))
		certID, _ := o.issue(t, pki.ServerCertificate(id.Short()+".adcs.test"))

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		requests := adcs.State(t).Requests
		require.Len(t, requests, 2)
		require.Equal(t, "HarnessWebServer", requests[2].Template)
		require.Equal(t, pki.ParseLeaf(t, requests[2].PEM).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})

	t.Run("should refuse to revoke, which Azure AD CS CAs do not support, and keep the certificate active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		adcs.Seed(t, azureadcs.WithTemplates("HarnessWebServer"))
		o := orderIssuerOn(t, proj, azureADCSProfile(t, tn, proj, ca, "HarnessWebServer"))
		certID, _ := o.issue(t, pki.ServerCertificate(id.Short()+".adcs.test"))

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Certificate revocation is not supported by this certificate authority type", apierr.Message(res.Body))
		require.Equal(t, "active", o.certificateStatus(t, certID))
	})

	t.Run("should list the templates the AD CS server publishes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		adcs.Seed(t, azureadcs.WithTemplates("HarnessWebServer", "HarnessClient"))

		// Action
		res, err := tn.Admin.API.GetAzureAdcsTemplatesWithResponse(t.Context(), ca.ID.String(), &api.GetAzureAdcsTemplatesParams{ProjectId: new(proj.ID.String())})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing templates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var names []string
		for _, tmpl := range res.JSON200.Templates {
			names = append(names, tmpl.Id)
		}
		require.Equal(t, []string{"HarnessWebServer", "HarnessClient"}, names)
	})
}
