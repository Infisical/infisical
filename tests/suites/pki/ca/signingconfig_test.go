package ca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// readSigningConfig reads the CA's signing configuration and returns it with its
// destination settings.
func readSigningConfig(t *testing.T, tn *harness.Tenant, ca pki.CA) (*api.GetCaSigningConfigResponse, map[string]any) {
	t.Helper()
	res, err := tn.Admin.API.GetCaSigningConfigWithResponse(t.Context(), ca.ID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the signing configuration returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	dest, ok := res.JSON200.DestinationConfig.(map[string]any)
	require.Truef(t, ok, "destinationConfig is %T", res.JSON200.DestinationConfig)
	return res, dest
}

// updateTemplate changes only the Azure AD CS template the CA's signing configuration
// names.
func updateTemplate(t *testing.T, tn *harness.Tenant, ca pki.CA, template string) {
	t.Helper()
	var dest api.UpdateCaSigningConfigJSONBody_DestinationConfig
	require.NoError(t, dest.FromUpdateCaSigningConfigJSONBodyDestinationConfig1(api.UpdateCaSigningConfigJSONBodyDestinationConfig1{Template: template}))
	res, err := tn.Admin.API.UpdateCaSigningConfigWithResponse(t.Context(), ca.ID.String(), api.UpdateCaSigningConfigJSONRequestBody{DestinationConfig: &dest})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the signing configuration: %s", apierr.Body(res.Body))
}

func TestIntermediateCA_SigningConfig(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back the Azure AD CS template a pending intermediate is configured with, and a new one after an update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AzureADCSPasswordAppConnection)
		adcs := azureadcs.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		adcs.Seed(t, azureadcs.WithCATemplates("HarnessSubCA", "HarnessSubCAv2"))
		ca := pki.NewPendingIntermediateCA(t, proj)
		createSigningConfig(t, tn, ca, azureADCSConfig(conn.ID, "HarnessSubCA"))
		created, dest := readSigningConfig(t, tn, ca)
		require.Equal(t, azureADCS, created.JSON200.Type)
		require.Equal(t, "HarnessSubCA", dest["template"])

		// Action
		updateTemplate(t, tn, ca, "HarnessSubCAv2")

		// Assert
		updated, dest := readSigningConfig(t, tn, ca)
		require.Equal(t, azureADCS, updated.JSON200.Type)
		require.Equal(t, "HarnessSubCAv2", dest["template"])
		require.NotNil(t, updated.JSON200.AppConnectionId, "updating the template dropped the App Connection")
		require.Equal(t, conn.ID, *updated.JSON200.AppConnectionId)
	})

	t.Run("should have Azure AD CS sign the intermediate under the template it was updated to", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "installWait: the install is queued and Infisical pauses 5 seconds before reading the certificate back from AD CS.")

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AzureADCSPasswordAppConnection)
		adcs := azureadcs.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		adcs.Seed(t, azureadcs.WithCATemplates("HarnessSubCA", "HarnessSubCAv2"))
		ca := pki.NewPendingIntermediateCA(t, proj)
		createSigningConfig(t, tn, ca, azureADCSConfig(conn.ID, "HarnessSubCA"))
		updateTemplate(t, tn, ca, "HarnessSubCAv2")

		// Action
		requestInstall(t, ca, installAzureADCS(t, tn))

		// Assert
		waitActive(t, tn, ca)
		adcs.ExpectEvent[azureadcs.CertificateIssued](t, func(e azureadcs.CertificateIssued) bool { return e.Template == "HarnessSubCAv2" })
	})
}
