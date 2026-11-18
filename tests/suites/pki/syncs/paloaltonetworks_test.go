package syncs_test

import (
	"encoding/pem"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/panos"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// paloAltoBody is a firewall sync of one certificate under the INF- name schema.
func paloAltoBody(conn *fixture.AppConnection, g *pki.Graph, cert pki.Certificate) api.CreatePaloAltoNetworksPkiSyncJSONRequestBody {
	body := api.CreatePaloAltoNetworksPkiSyncJSONRequestBody{
		Name:           "pan-" + id.Short(),
		ConnectionId:   conn.ID,
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.SyncOptions.CertificateNameSchema = "INF-{{shortCertificateId}}"
	return body
}

// paloAltoKeyPair finds the key pair the firewall holds for a certificate.
func paloAltoKeyPair(t *testing.T, fw *panos.Firewall, cert pki.Certificate) string {
	t.Helper()
	for name, c := range fw.Certificates {
		if c.PrivateKey != "" && strings.TrimSpace(c.PublicKey) == strings.TrimSpace(cert.Certificate) {
			return name
		}
	}
	require.FailNow(t, "the firewall holds no key pair for the certificate")
	return ""
}

func TestPaloAltoNetworksPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should import the certificate with its encrypted key and each CA of its chain, then commit them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
		fw := panos.Open(t, conn.FakenetAdmin(t), conn.Nonce())

		// Action
		res, err := tn.Admin.API.CreatePaloAltoNetworksPkiSyncWithResponse(t.Context(), paloAltoBody(conn, g, cert))

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, res.JSON200.Id.String(), nil)
		state := fw.State(t)
		pair := paloAltoKeyPair(t, state, cert)
		require.Contains(t, state.Certificates[pair].PrivateKey, "-----BEGIN ENCRYPTED PRIVATE KEY-----")
		want := []string{pair}
		for rest := []byte(cert.Chain); ; {
			var block *pem.Block
			if block, rest = pem.Decode(rest); block == nil {
				break
			}
			ca := strings.TrimSpace(string(pem.EncodeToMemory(block)))
			for name, c := range state.Certificates {
				if strings.HasPrefix(name, "INF-CA-") && strings.TrimSpace(c.PublicKey) == ca {
					want = append(want, name)
				}
			}
		}
		require.Len(t, want, 3, "the intermediate and the root should each be imported as INF-CA-<fingerprint>")
		require.NotNil(t, state.Committed)
		require.ElementsMatch(t, want, state.Committed.Certificates)
	})

	t.Run("should refuse to create a sync naming a template when the connection reaches a firewall", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
		fw := panos.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		body := paloAltoBody(conn, g, cert)
		body.DestinationConfig.Template = new("branch")

		// Action
		res, err := tn.Admin.API.CreatePaloAltoNetworksPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "The connection points to a firewall, not a Panorama, so template 'branch' cannot be used. Remove the template from the sync.", apierr.Message(res.Body))
		require.Empty(t, fw.State(t).Certificates)
		body.DestinationConfig.Template = nil
		retry, err := tn.Admin.API.CreatePaloAltoNetworksPkiSyncWithResponse(t.Context(), body)
		require.NoError(t, err)
		require.NotNilf(t, retry.JSON200, "the refused sync's name should still be free, but creating it returned %d: %s", retry.StatusCode(), apierr.Body(retry.Body))
	})
}

func TestPaloAltoNetworksSslTlsProfilePkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should point the SSL/TLS service profile at the imported certificate and commit it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
		fw := panos.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		fw.Seed(t, panos.WithProfile("portal"))

		body := api.CreatePaloAltoNetworksSslTlsProfilePkiSyncJSONRequestBody{
			Name:           "pan-profile-" + id.Short(),
			ConnectionId:   conn.ID,
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.SslTlsServiceProfileName = "portal"
		body.SyncOptions.CertificateNameSchema = "INF-{{shortCertificateId}}"

		// Action
		res, err := tn.Admin.API.CreatePaloAltoNetworksSslTlsProfilePkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksSslTlsProfilePkiSync, res.JSON200.Id.String(), nil)
		state := fw.State(t)
		pair := paloAltoKeyPair(t, state, cert)
		require.Equal(t, pair, state.Profiles["portal"])
		require.Equal(t, pair, state.Committed.Profiles["portal"])
	})
}
