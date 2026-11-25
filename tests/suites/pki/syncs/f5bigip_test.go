package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/f5bigip"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// f5Sync is an auto-syncing F5 BIG-IP sync installing into the Common partition.
type f5Sync struct {
	id    string
	bigip *f5bigip.ControlPlane
}

// newF5Sync creates the sync over a new F5 BIG-IP connection; prepare runs on the
// device before Infisical is handed the sync, to seed or fail something.
func newF5Sync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*f5bigip.ControlPlane), preserveItemOnRenewal *bool) f5Sync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.F5BigIpBasicAuthAppConnection)
	bigip := f5bigip.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(bigip)
	}
	body := api.CreateF5BigIpPkiSyncJSONRequestBody{
		Name:           "f5-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	body.SyncOptions.PreserveItemOnRenewal = preserveItemOnRenewal
	res, err := tn.Admin.API.CreateF5BigIpPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return f5Sync{id: res.JSON200.Id.String(), bigip: bigip}
}

func (s f5Sync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncF5BigIpPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// f5Path is the full path of the ssl-cert and ssl-key objects named after a certificate.
func f5Path(certID string) string {
	return "/Common/Infisical-" + strings.ReplaceAll(certID, "-", "")
}

// privateKeyOf is the private key Infisical holds for a certificate, which a renewal
// response does not return.
func privateKeyOf(t *testing.T, as *harness.Principal, certID string) string {
	t.Helper()
	bundle, err := as.API.GetCertificateBundleWithResponse(t.Context(), uuid.MustParse(certID))
	require.NoError(t, err)
	require.NotNilf(t, bundle.JSON200, "reading the bundle returned %d: %s", bundle.StatusCode(), apierr.Body(bundle.Body))
	require.NotNil(t, bundle.JSON200.PrivateKey)
	return strings.TrimSpace(*bundle.JSON200.PrivateKey)
}

func TestF5BigIpPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should install the ssl-cert and ssl-key objects from the uploaded files, remove the uploads and save the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		path := f5Path(cert.ID.String())

		// Action
		s := newF5Sync(t, tn, g, cert, nil, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, nil)
		state := s.bigip.State(t)
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(state.SSLCerts[path]))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(state.SSLKeys[path]))
		require.Contains(t, state.Saved, "ssl-cert "+path)
		require.Contains(t, state.Saved, "ssl-key "+path)
		require.Empty(t, state.Downloads)
	})

	t.Run("should update the same ssl-cert and ssl-key objects with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newF5Sync(t, tn, g, cert, nil, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, nil)
		path := f5Path(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, done.LastSyncedAt)
		s.bigip.ExpectEvent[f5bigip.FileObjectInstalled](t, func(e f5bigip.FileObjectInstalled) bool { return e.Kind == "ssl-cert" && e.Path == path })
		s.bigip.ExpectEvent[f5bigip.FileObjectInstalled](t, func(e f5bigip.FileObjectInstalled) bool { return e.Kind == "ssl-key" && e.Path == path })
		state := s.bigip.State(t)
		key := privateKeyOf(t, g.Operator, renewed.JSON200.CertificateId)
		require.NotEqual(t, strings.TrimSpace(cert.PrivateKey), key)
		require.Equal(t, strings.TrimSpace(renewed.JSON200.Certificate), strings.TrimSpace(state.SSLCerts[path]))
		require.Equal(t, key, strings.TrimSpace(state.SSLKeys[path]))
		require.NotContains(t, state.SSLCerts, f5Path(renewed.JSON200.CertificateId))
		require.NotContains(t, state.SSLKeys, f5Path(renewed.JSON200.CertificateId))
	})

	t.Run("should install a renewed certificate under its own name and delete the old objects when preserving the item is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newF5Sync(t, tn, g, cert, nil, new(false))
		done := cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, nil)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, done.LastSyncedAt)
		fresh := f5Path(renewed.JSON200.CertificateId)
		old := f5Path(cert.ID.String())
		s.bigip.ExpectEvent[f5bigip.FileObjectInstalled](t, func(e f5bigip.FileObjectInstalled) bool { return e.Kind == "ssl-cert" && e.Path == fresh })
		s.bigip.ExpectEvent[f5bigip.FileObjectInstalled](t, func(e f5bigip.FileObjectInstalled) bool { return e.Kind == "ssl-key" && e.Path == fresh })
		s.bigip.ExpectEvent[f5bigip.FileObjectDeleted](t, func(e f5bigip.FileObjectDeleted) bool { return e.Kind == "ssl-cert" && e.Path == old })
		s.bigip.ExpectEvent[f5bigip.FileObjectDeleted](t, func(e f5bigip.FileObjectDeleted) bool { return e.Kind == "ssl-key" && e.Path == old })
		state := s.bigip.State(t)
		require.Equal(t, strings.TrimSpace(renewed.JSON200.Certificate), strings.TrimSpace(state.SSLCerts[fresh]))
		require.Equal(t, privateKeyOf(t, g.Operator, renewed.JSON200.CertificateId), strings.TrimSpace(state.SSLKeys[fresh]))
		require.NotContains(t, state.SSLCerts, old)
		require.NotContains(t, state.SSLKeys, old)
	})

	t.Run("should unbind the certificate from the Client SSL profiles using it, then delete its objects", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newF5Sync(t, tn, g, cert, nil, nil)
		cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, nil)
		path := f5Path(cert.ID.String())
		other := f5bigip.CertKeyChainEntry{Name: "default", Cert: "/Common/default.crt", Key: "/Common/default.key"}
		s.bigip.Seed(t, f5bigip.ClientSSLProfile("/Common/web-ssl", other,
			f5bigip.CertKeyChainEntry{Name: "web", Cert: path, Key: path, Chain: path + "-chain"}))

		// Action
		res, err := tn.Admin.API.RemoveF5BigIpPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		updated := s.bigip.ExpectEvent[f5bigip.ClientSSLProfileUpdated](t, func(e f5bigip.ClientSSLProfileUpdated) bool { return e.Path == "/Common/web-ssl" }, cloudSyncRemoval)
		s.bigip.ExpectEvent[f5bigip.FileObjectDeleted](t, func(e f5bigip.FileObjectDeleted) bool { return e.Kind == "ssl-cert" && e.Path == path+"-chain" })
		require.Equal(t, []f5bigip.CertKeyChainEntry{other}, updated.CertKeyChain)
		state := s.bigip.State(t)
		require.Empty(t, state.SSLCerts)
		require.Empty(t, state.SSLKeys)
	})

	t.Run("should mark the certificate failed with BIG-IP's message when it refuses the ssl-cert object", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		const reason = "01070734:3: Configuration error: Certificate Manager role cannot modify ssl-cert objects in partition Common"
		refuse := func(b *f5bigip.ControlPlane) {
			b.Fail(t, http.MethodPost, "/mgmt/tm/sys/file/ssl-cert", http.StatusBadRequest,
				fakenet.Body(`{"code":400,"message":"`+reason+`","errorStack":[],"apiError":3}`))
		}

		// Action
		s := newF5Sync(t, tn, g, cert, refuse, nil)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetF5BigIpPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: "+reason, failureMessage(t, tn, s.id))
		require.Empty(t, s.bigip.State(t).SSLCerts)
	})
}
