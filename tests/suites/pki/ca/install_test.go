package ca_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fakes/venaficloud"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// installWait is how long an intermediate waits for its certificate from an external
// signer. The install runs on a queue and Infisical reads AD CS back only after a fixed
// 5 second pause, so it takes longer than the default 30 seconds under a loaded suite.
const installWait = 2 * time.Minute

// azureADCS is the signing configuration type for Azure AD CS.
const azureADCS = "azure-ad-cs"

// azureADCSConfig signs through Azure AD CS over the connection under a CA template.
func azureADCSConfig(connID uuid.UUID, template string) map[string]any {
	return map[string]any{"type": azureADCS, "appConnectionId": connID, "destinationConfig": map[string]any{"template": template}}
}

// createSigningConfig points a pending intermediate's signing configuration at an
// external signer. The body is a union the generated client cannot serialise.
func createSigningConfig(t *testing.T, tn *harness.Tenant, ca pki.CA, config map[string]any) {
	t.Helper()
	raw, err := json.Marshal(config)
	require.NoError(t, err)
	res, err := tn.Admin.API.CreateCaSigningConfigWithBodyWithResponse(t.Context(), ca.ID.String(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	require.Truef(t, res.StatusCode() < 300, "creating the signing configuration returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

// requestInstall asks for a pending intermediate's certificate to be installed from its
// external signer.
func requestInstall(t *testing.T, ca pki.CA, install func(caID string, body *bytes.Reader) (int, []byte, error)) {
	t.Helper()
	status, body, err := install(ca.ID.String(), bytes.NewReader([]byte(`{}`)))
	require.NoError(t, err)
	require.Equalf(t, http.StatusAccepted, status, "installing returned %d: %s", status, apierr.Body(body))
}

// installAzureADCS installs a pending intermediate's certificate from Azure AD CS.
func installAzureADCS(t *testing.T, tn *harness.Tenant) func(caID string, body *bytes.Reader) (int, []byte, error) {
	return func(caID string, body *bytes.Reader) (int, []byte, error) {
		res, err := tn.Admin.API.InstallCaCertificateAdcsWithBodyWithResponse(t.Context(), caID, "application/json", body)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	}
}

// signThrough points a pending intermediate's signing configuration at an external
// signer and asks for the certificate to be installed.
func signThrough(t *testing.T, tn *harness.Tenant, ca pki.CA, config map[string]any, install func(caID string, body *bytes.Reader) (int, []byte, error)) {
	t.Helper()
	createSigningConfig(t, tn, ca, config)
	requestInstall(t, ca, install)
}

func waitActive(t *testing.T, tn *harness.Tenant, ca pki.CA) {
	t.Helper()
	pki.Poll(t, "reading the intermediate CA", func(ctx context.Context) (*api.GetInternalCertificateAuthorityV1Response, int, []byte, error) {
		res, status, body, err := pki.ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return tn.Admin.API.GetInternalCertificateAuthorityV1(ctx, ca.ID.String())
		}, api.ParseGetInternalCertificateAuthorityV1Response)
		if err == nil && status == http.StatusOK && res.JSON200 == nil {
			err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
		}
		return res, status, body, err
	}, func(res *api.GetInternalCertificateAuthorityV1Response) bool {
		return res.JSON200.Status == "active"
	}, wait.Timeout(installWait))
}

func TestIntermediateCA_InstallExternal(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should become active with a certificate Azure AD CS signed under its CA template", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "installWait: the install is queued and Infisical pauses 5 seconds before reading the certificate back from AD CS.")

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AzureADCSPasswordAppConnection)
		adcs := azureadcs.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		adcs.Seed(t, azureadcs.WithCATemplates("HarnessSubCA"))
		ca := pki.NewPendingIntermediateCA(t, proj)

		// Action
		signThrough(t, tn, ca, azureADCSConfig(conn.ID, "HarnessSubCA"), installAzureADCS(t, tn))

		// Assert
		waitActive(t, tn, ca)
		cert := pki.CACertificate(t, tn.Admin, ca.ID)
		require.True(t, cert.IsCA)
		root := pki.ParseLeaf(t, adcs.State(t).Root)
		_, err := cert.Verify(x509VerifyCA(root))
		require.NoError(t, err)
		adcs.ExpectEvent[azureadcs.CertificateIssued](t, func(e azureadcs.CertificateIssued) bool { return e.Template == "HarnessSubCA" })
	})

	t.Run("should become active with a certificate Venafi TLS Protect Cloud signed under its issuing template", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "installWait: the install is queued behind other CA jobs on the shared instance.")

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.VenafiCloudAPIKeyAppConnection)
		vc := venaficloud.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		app, tmpl := uuid.NewString(), uuid.NewString()
		vc.Seed(t, venaficloud.WithApplication(app, tmpl))
		ca := pki.NewPendingIntermediateCA(t, proj)

		// Action
		signThrough(t, tn, ca, map[string]any{"type": "venafi", "appConnectionId": conn.ID,
			"destinationConfig": map[string]any{"applicationId": app, "issuingTemplateId": tmpl}},
			func(caID string, body *bytes.Reader) (int, []byte, error) {
				res, err := tn.Admin.API.InstallCaCertificateVenafiWithBodyWithResponse(t.Context(), caID, "application/json", body)
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			})

		// Assert
		waitActive(t, tn, ca)
		cert := pki.CACertificate(t, tn.Admin, ca.ID)
		require.True(t, cert.IsCA)
		root := pki.ParseLeaf(t, vc.State(t).Root)
		_, err := cert.Verify(x509VerifyCA(root))
		require.NoError(t, err)
		vc.ExpectEvent[venaficloud.CertificateIssued](t, func(e venaficloud.CertificateIssued) bool {
			return e.ApplicationID == app && e.TemplateID == tmpl
		})
	})
}
