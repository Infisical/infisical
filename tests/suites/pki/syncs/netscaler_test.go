package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/netscaler"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// netscalerSync is an auto-syncing NetScaler sync.
type netscalerSync struct {
	id  string
	adc *netscaler.ControlPlane
}

// newNetscalerSync creates the sync over a new NetScaler connection; prepare runs on
// the ADC before Infisical is handed the sync, to seed or fail something, and configure
// adjusts the request body.
func newNetscalerSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*netscaler.ControlPlane), configure func(*api.CreateNetscalerPkiSyncJSONRequestBody)) netscalerSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.NetScalerBasicAuthAppConnection)
	adc := netscaler.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(adc)
	}
	body := api.CreateNetscalerPkiSyncJSONRequestBody{
		Name:           "netscaler-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	if configure != nil {
		configure(&body)
	}
	res, err := tn.Admin.API.CreateNetscalerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return netscalerSync{id: res.JSON200.Id.String(), adc: adc}
}

func (s netscalerSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncNetscalerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// netscalerCertKey is the certkey name "Infisical-{{certificateId}}" gives a certificate.
func netscalerCertKey(certID string) string {
	return "Infisical-" + strings.ReplaceAll(certID, "-", "")
}

func TestNetScalerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a certkey from the uploaded certificate and key files and save the config holding it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		name := applianceObjectName(cert)

		// Action
		s := newNetscalerSync(t, tn, g, cert, nil, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, nil)
		state := s.adc.State(t)
		require.Equal(t, &netscaler.CertKey{Cert: "/nsconfig/ssl/" + name + ".cer", Key: "/nsconfig/ssl/" + name + ".key"}, state.CertKeys[name])
		require.True(t, strings.HasPrefix(state.Files["/nsconfig/ssl/"+name+".cer"], strings.TrimSpace(cert.Certificate)))
		require.Contains(t, state.Files["/nsconfig/ssl/"+name+".cer"], syncedIntermediate(t, cert))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(state.Files["/nsconfig/ssl/"+name+".key"]))
		require.Contains(t, state.Saved, name)
	})

	t.Run("should update the same certkey with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newNetscalerSync(t, tn, g, cert, nil, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, nil)
		name := netscalerCertKey(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, done.LastSyncedAt)
		s.adc.ExpectEvent[netscaler.CertKeyUpdated](t, func(e netscaler.CertKeyUpdated) bool { return e.Name == name })
		state := s.adc.State(t)
		require.Len(t, state.CertKeys, 1)
		require.True(t, strings.HasPrefix(state.Files[state.CertKeys[name].Cert], strings.TrimSpace(renewed.JSON200.Certificate)))
	})

	t.Run("should create an Infisical-<id> certkey for a renewed certificate and delete the old one when preserving the item is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newNetscalerSync(t, tn, g, cert, nil, func(b *api.CreateNetscalerPkiSyncJSONRequestBody) {
			b.SyncOptions.PreserveItemOnRenewal = new(false)
		})
		done := cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, nil)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, done.LastSyncedAt)
		fresh := netscalerCertKey(renewed.JSON200.CertificateId)
		old := netscalerCertKey(cert.ID.String())
		s.adc.ExpectEvent[netscaler.CertKeyCreated](t, func(e netscaler.CertKeyCreated) bool { return e.Name == fresh })
		s.adc.ExpectEvent[netscaler.CertKeyDeleted](t, func(e netscaler.CertKeyDeleted) bool { return e.Name == old })
		state := s.adc.State(t)
		require.True(t, strings.HasPrefix(state.Files[state.CertKeys[fresh].Cert], strings.TrimSpace(renewed.JSON200.Certificate)))
		require.NotContains(t, state.CertKeys, old)
	})

	t.Run("should unbind the certkey from the vserver, then delete it with its files", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newNetscalerSync(t, tn, g, cert, func(adc *netscaler.ControlPlane) { adc.Seed(t, netscaler.VServer("vs-web")) },
			func(b *api.CreateNetscalerPkiSyncJSONRequestBody) { b.DestinationConfig.VserverName = new("vs-web") })
		cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, s.id, nil)
		name := netscalerCertKey(cert.ID.String())
		require.Equal(t, []string{name}, s.adc.State(t).VServers["vs-web"])

		// Action
		res, err := tn.Admin.API.RemoveNetscalerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.adc.ExpectEvent[netscaler.CertKeyUnbound](t, func(e netscaler.CertKeyUnbound) bool { return e.VServer == "vs-web" && e.CertKey == name }, cloudSyncRemoval)
		s.adc.ExpectEvent[netscaler.CertKeyDeleted](t, func(e netscaler.CertKeyDeleted) bool { return e.Name == name })
		state := s.adc.State(t)
		require.Empty(t, state.VServers["vs-web"])
		require.Empty(t, state.Files)
	})

	t.Run("should mark the certificate failed with NetScaler's message when it refuses the file upload", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		const reason = "Not authorized to execute this command [add system file]"
		refuse := func(adc *netscaler.ControlPlane) {
			adc.Fail(t, http.MethodPost, "/nitro/v1/config/systemfile", http.StatusForbidden,
				fakenet.Body(`{"errorcode":10,"message":"`+reason+`","severity":"ERROR"}`))
		}

		// Action
		s := newNetscalerSync(t, tn, g, cert, refuse, nil)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetNetscalerPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: "+reason, failureMessage(t, tn, s.id))
		require.Empty(t, s.adc.State(t).CertKeys)
	})
}
