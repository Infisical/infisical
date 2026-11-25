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
	"github.com/Infisical/infisical/tests/infra/fakenet"
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

// paloAltoSync is an auto-syncing sync of one certificate to a firewall.
type paloAltoSync struct {
	id   string
	conn *fixture.AppConnection
	fw   *panos.ControlPlane
}

// newPaloAltoSync creates a firewall sync over a new connection; prepare runs on the
// firewall before Infisical is handed the sync, to seed something.
func newPaloAltoSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, preserveItemOnRenewal *bool, prepare func(*panos.ControlPlane)) paloAltoSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
	fw := panos.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(fw)
	}
	body := paloAltoBody(conn, g, cert)
	body.SyncOptions.PreserveItemOnRenewal = preserveItemOnRenewal
	res, err := tn.Admin.API.CreatePaloAltoNetworksPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return paloAltoSync{id: res.JSON200.Id.String(), conn: conn, fw: fw}
}

func (s paloAltoSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncPaloAltoNetworksPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// newPaloAltoProfileSync creates a sync pointing the "portal" SSL/TLS service profile at
// one certificate; prepare runs on the firewall before Infisical is handed the sync.
func newPaloAltoProfileSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*panos.ControlPlane)) paloAltoSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
	fw := panos.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(fw)
	}
	body := api.CreatePaloAltoNetworksSslTlsProfilePkiSyncJSONRequestBody{
		Name:           "pan-profile-" + id.Short(),
		ConnectionId:   conn.ID,
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.SslTlsServiceProfileName = "portal"
	body.SyncOptions.CertificateNameSchema = "INF-{{shortCertificateId}}"
	res, err := tn.Admin.API.CreatePaloAltoNetworksSslTlsProfilePkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return paloAltoSync{id: res.JSON200.Id.String(), conn: conn, fw: fw}
}

func (s paloAltoSync) triggerProfile(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncPaloAltoNetworksSslTlsProfilePkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
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

	t.Run("should import a renewed certificate under the name the certificate it replaced had", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoSync(t, tn, g, cert, nil, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, nil)
		name := paloAltoKeyPair(t, s.fw.State(t), cert)
		mark := s.fw.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, done.LastSyncedAt)
		s.fw.ExpectEvent[panos.CertificateImported](t, func(e panos.CertificateImported) bool { return e.Name == name && e.Category == "keypair" }, fakenet.Since(mark))
		state := s.fw.State(t)
		require.Equal(t, name, paloAltoKeyPair(t, state, pki.Certificate{Certificate: renewed.JSON200.Certificate}))
		require.Contains(t, state.Committed.Certificates, name)
		s.fw.ExpectNoEvent[panos.CertificateDeleted](t, nil, fakenet.Since(mark))
	})

	t.Run("should import a renewed certificate under a new name and delete the old one when preserving the name is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoSync(t, tn, g, cert, new(false), nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, nil)
		old := paloAltoKeyPair(t, s.fw.State(t), cert)
		mark := s.fw.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, done.LastSyncedAt)
		s.fw.ExpectEvent[panos.CertificateDeleted](t, func(e panos.CertificateDeleted) bool { return e.Name == old }, fakenet.Since(mark))
		state := s.fw.State(t)
		fresh := paloAltoKeyPair(t, state, pki.Certificate{Certificate: renewed.JSON200.Certificate})
		require.NotEqual(t, old, fresh)
		require.NotContains(t, state.Certificates, old)
		require.Contains(t, state.Committed.Certificates, fresh)
		require.NotContains(t, state.Committed.Certificates, old)
	})

	t.Run("should mark the certificate failed with the firewall's reason when the firewall refuses the import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(fw *panos.ControlPlane) {
			fw.Seed(t, panos.RefuseImports("Import failed. The maximum number of certificates has been reached"))
		}

		// Action
		s := newPaloAltoSync(t, tn, g, cert, nil, refuse)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Import failed. The maximum number of certificates has been reached", failureMessage(t, tn, s.id))
		fw := s.fw.State(t)
		require.Empty(t, fw.Certificates)
		require.Nil(t, fw.Committed)
	})
}

func TestPaloAltoNetworksPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the sync's key pair, keep the CA certificates and commit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoSync(t, tn, g, cert, nil, nil)
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksPkiSync, s.id, nil)
		pair := paloAltoKeyPair(t, s.fw.State(t), cert)
		mark := s.fw.Mark(t)

		// Action
		res, err := tn.Admin.API.RemovePaloAltoNetworksPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.fw.ExpectEvent[panos.CertificateDeleted](t, func(e panos.CertificateDeleted) bool { return e.Name == pair }, fakenet.Since(mark), cloudSyncRemoval)
		committed := s.fw.ExpectEvent[panos.Committed](t, nil, fakenet.Since(mark))
		require.NotContains(t, committed.Certificates, pair)
		left := s.fw.State(t).Certificates
		require.NotContains(t, left, pair)
		require.Len(t, left, 2, "the intermediate and the root should stay")
		for name := range left {
			require.True(t, strings.HasPrefix(name, "INF-CA-"), "unexpected certificate %s left on the firewall", name)
		}
	})
}

func TestPaloAltoNetworksPkiSync_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse to move the sync to a connection whose firewall cannot be reached and keep the old connection", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoSync(t, tn, g, cert, nil, nil)
		other := fixture.NewAppConnection(t, tn, fixture.PaloAltoNetworksBasicAuthAppConnection)
		panos.Open(t, other.FakenetAdmin(t), other.Nonce()).Fail(t, http.MethodPost, "/api/", 0, fakenet.Hangup())

		// Action
		res, err := tn.Admin.API.UpdatePaloAltoNetworksPkiSyncWithResponse(t.Context(), s.id,
			api.UpdatePaloAltoNetworksPkiSyncJSONRequestBody{ConnectionId: &other.ID})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "updating the sync: %s", apierr.Body(res.Body))
		require.Equal(t, "Palo Alto Networks device '"+panos.Service.Host()+"' could not complete the request: the management interface could not be reached (socket hang up). "+
			"Check the hostname and port, and that HTTPS management access is allowed from Infisical or the gateway.", apierr.Message(res.Body))
		got, err := tn.Admin.API.GetPaloAltoNetworksPkiSyncWithResponse(t.Context(), s.id)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the sync returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, s.conn.ID, got.JSON200.ConnectionId)
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

	t.Run("should keep the profile on the same name, now holding the renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoProfileSync(t, tn, g, cert, func(fw *panos.ControlPlane) { fw.Seed(t, panos.WithProfile("portal")) })
		done := cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksSslTlsProfilePkiSync, s.id, nil)
		name := paloAltoKeyPair(t, s.fw.State(t), cert)
		mark := s.fw.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.triggerProfile(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksSslTlsProfilePkiSync, s.id, done.LastSyncedAt)
		s.fw.ExpectEvent[panos.CertificateImported](t, func(e panos.CertificateImported) bool { return e.Name == name && e.Category == "keypair" }, fakenet.Since(mark))
		state := s.fw.State(t)
		require.Equal(t, name, paloAltoKeyPair(t, state, pki.Certificate{Certificate: renewed.JSON200.Certificate}))
		require.Equal(t, name, state.Profiles["portal"])
		require.Equal(t, name, state.Committed.Profiles["portal"])
	})

	t.Run("should mark the certificate failed and import nothing when the SSL/TLS service profile does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newPaloAltoProfileSync(t, tn, g, cert, nil)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetPaloAltoNetworksSslTlsProfilePkiSync, s.id, nil, "failed")
		require.Equal(t, "SSL/TLS service profile 'portal' was not found. Create it on the device or update the sync.", failureMessage(t, tn, s.id))
		require.Empty(t, s.fw.State(t).Certificates)
	})
}

func TestPaloAltoNetworksSslTlsProfilePkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should switch the profile to the replacement certificate before deleting the sync's key pair", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newPaloAltoProfileSync(t, tn, g, cert, func(fw *panos.ControlPlane) {
			fw.Seed(t, panos.WithProfile("portal"), panos.WithCertificate("fallback", syncedIntermediate(t, cert)))
		})
		cloudSyncSucceeded(t, tn.Admin.API.GetPaloAltoNetworksSslTlsProfilePkiSync, s.id, nil)
		pair := paloAltoKeyPair(t, s.fw.State(t), cert)
		mark := s.fw.Mark(t)
		var body api.RemovePaloAltoNetworksSslTlsProfilePkiSyncCertificatesJSONRequestBody
		body.RemovalOptions = &struct {
			ReplacementCertificateName *string `json:"replacementCertificateName,omitempty"`
		}{ReplacementCertificateName: new("fallback")}

		// Action
		res, err := tn.Admin.API.RemovePaloAltoNetworksSslTlsProfilePkiSyncCertificatesWithResponse(t.Context(), s.id, body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.fw.ExpectEvent[panos.ProfileUpdated](t, func(e panos.ProfileUpdated) bool { return e.Name == "portal" && e.Certificate == "fallback" }, fakenet.Since(mark), cloudSyncRemoval)
		s.fw.ExpectEvent[panos.CertificateDeleted](t, func(e panos.CertificateDeleted) bool { return e.Name == pair }, fakenet.Since(mark))
		committed := s.fw.ExpectEvent[panos.Committed](t, nil, fakenet.Since(mark))
		require.Equal(t, "fallback", committed.Profiles["portal"])
		require.NotContains(t, committed.Certificates, pair)
		state := s.fw.State(t)
		require.Equal(t, "fallback", state.Profiles["portal"])
		require.NotContains(t, state.Certificates, pair)
	})
}
