package externalca_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// azureADCSProfile is a profile on the CA that requests certificates under template.
func azureADCSProfile(t *testing.T, tn *harness.Tenant, proj *pki.Project, ca pki.CA, template string) pki.Profile {
	t.Helper()
	policy := pki.NewPolicy(t, proj, pki.AllowAll(t))
	var external api.CreateCertificateProfileJSONBody_ExternalConfigs
	require.NoError(t, external.FromCreateCertificateProfileJSONBodyExternalConfigs0(api.CreateCertificateProfileJSONBodyExternalConfigs0{Template: template}))
	res, err := tn.Admin.API.CreateCertificateProfileWithResponse(t.Context(), api.CreateCertificateProfileJSONRequestBody{
		ProjectId:           new(proj.ID.String()),
		Slug:                "profile-" + id.Short(),
		CaId:                &ca.ID,
		CertificatePolicyId: policy.ID,
		ExternalConfigs:     &external,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return pki.Profile{ID: res.JSON200.CertificateProfile.Id}
}

func TestAzureADCSCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue under the profile's certificate template, signed by the AD CS CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		adcs.Seed(t, azureadcs.WithTemplates("HarnessWebServer"))
		o := orderIssuerOn(t, proj, azureADCSProfile(t, tn, proj, ca, "HarnessWebServer"))
		name := id.Short() + ".adcs.test"

		// Action
		res := o.order(t, pki.ServerCertificate(name))

		// Assert
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, adcs.State(t).Root)))
		adcs.ExpectEvent[azureadcs.CertificateIssued](t, func(e azureadcs.CertificateIssued) bool { return e.Template == "HarnessWebServer" })
	})
}
