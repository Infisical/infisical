package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// cloudflareSync is an auto-syncing Cloudflare custom certificate sync into one zone.
type cloudflareSync struct {
	id   string
	get  cloudSyncGet
	cf   *cloudflare.ControlPlane
	zone string
}

// newCloudflareSync syncs one certificate to a new zone; prepare runs on the account
// before Infisical is handed the sync.
func newCloudflareSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, prepare func(cf *cloudflare.ControlPlane, zone string), cert pki.Certificate) cloudflareSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.CloudflareAPITokenAppConnection)
	zone := id.Nonce()
	cf := cloudflare.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	cf.Seed(t, cloudflare.WithZone(zone))
	if prepare != nil {
		prepare(cf, zone)
	}

	body := api.CreateCloudflareCustomCertificatePkiSyncJSONRequestBody{
		Name:           "cloudflare-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.ZoneId = zone
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	res, err := tn.Admin.API.CreateCloudflareCustomCertificatePkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return cloudflareSync{id: res.JSON200.Id.String(), get: tn.Admin.API.GetCloudflareCustomCertificatePkiSync, cf: cf, zone: zone}
}

func (s cloudflareSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncCloudflareCustomCertificatePkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func (s cloudflareSync) certificates(t *testing.T) []cloudflare.CustomCertificate {
	t.Helper()
	return s.cf.State(t).CustomCertificates[s.zone]
}

func TestCloudflareCustomCertificatePkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should upload the certificate as an SNI custom certificate for its names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newCloudflareSync(t, tn, g, nil, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		uploaded := s.certificates(t)
		require.Len(t, uploaded, 1)
		require.Equal(t, "sni_custom", uploaded[0].Type)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).DNSNames, uploaded[0].Hosts)
		require.Contains(t, uploaded[0].Certificate, strings.TrimSpace(cert.Certificate))
	})

	t.Run("should update the uploaded certificate in place instead of adding a second one when the sync runs again", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newCloudflareSync(t, tn, g, nil, cert)
		first := cloudSyncSucceeded(t, s.get, s.id, nil)
		mark := s.cf.Mark(t)

		// Action
		s.trigger(t, tn)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, first.LastSyncedAt)
		s.cf.ExpectEvent[cloudflare.CustomCertificateUpdated](t, nil, fakenet.Since(mark))
		uploaded := s.certificates(t)
		require.Len(t, uploaded, 1)
		require.Equal(t, 1, uploaded[0].Updates)
	})

	t.Run("should patch the uploaded certificate in place with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newCloudflareSync(t, tn, g, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		original := s.certificates(t)[0].ID
		mark := s.cf.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.cf.ExpectEvent[cloudflare.CustomCertificateUpdated](t, func(e cloudflare.CustomCertificateUpdated) bool {
			return e.Zone == s.zone && e.ID == original
		}, fakenet.Since(mark))
		uploaded := s.certificates(t)
		require.Len(t, uploaded, 1)
		require.Equal(t, original, uploaded[0].ID)
		require.Contains(t, uploaded[0].Certificate, strings.TrimSpace(renewed.JSON200.Certificate))
		s.cf.ExpectNoEvent[cloudflare.CustomCertificateCreated](t, nil, fakenet.Since(mark))
	})

	t.Run("should mark the sync and the certificate failed, with Cloudflare's reason, when Cloudflare refuses the upload", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(cf *cloudflare.ControlPlane, zone string) {
			cf.Fail(t, http.MethodPost, "/client/v4/zones/"+zone+"/custom_certificates", http.StatusForbidden,
				fakenet.Body(`{"success":false,"errors":[{"code":10000,"message":"Authentication error"}],"messages":[],"result":null}`))
		}

		// Action
		s := newCloudflareSync(t, tn, g, refuse, cert)

		// Assert
		cloudSyncAwait(t, s.get, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Failed to upload certificate Infisical-"+strings.ReplaceAll(cert.ID.String(), "-", "")+
			" to Cloudflare: Authentication error", failureMessage(t, tn, s.id))
		require.Empty(t, s.certificates(t))
	})
}

func TestCloudflareCustomCertificatePkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the sync's custom certificate from the zone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newCloudflareSync(t, tn, g, nil, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		uploaded := s.certificates(t)[0].ID

		// Action
		res, err := tn.Admin.API.RemoveCloudflareCustomCertificatePkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.cf.ExpectEvent[cloudflare.CustomCertificateDeleted](t, func(e cloudflare.CustomCertificateDeleted) bool {
			return e.Zone == s.zone && e.ID == uploaded
		}, cloudSyncRemoval)
		require.Empty(t, s.certificates(t))
	})
}
