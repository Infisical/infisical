package syncs_test

import (
	"math/rand/v2"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// impervaSync is an auto-syncing Imperva sync to a website of its own, which serves
// the certificate's names. The site is unique because Infisical skips removing a
// certificate from a site and key type that another sync on the instance holds.
type impervaSync struct {
	id   string
	site string
	cp   *imperva.ControlPlane
}

// newImpervaSync creates the sync over a new Imperva connection; prepare runs on the
// account, with the sync's site, before Infisical is handed the sync, to fail something.
func newImpervaSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(cp *imperva.ControlPlane, site string)) impervaSync {
	t.Helper()
	site := strconv.FormatUint(rand.Uint64N(1e12)+1, 10)
	conn := fixture.NewAppConnection(t, tn, fixture.ImpervaAPIKeyAppConnection)
	cp := imperva.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	cp.Seed(t, imperva.WithSite(site, "shop", pki.ParseLeaf(t, cert.Certificate).DNSNames...))
	if prepare != nil {
		prepare(cp, site)
	}
	body := api.CreateImpervaPkiSyncJSONRequestBody{
		Name:           "imperva-" + id.Short(),
		ConnectionId:   conn.ID,
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.SiteId = site
	res, err := tn.Admin.API.CreateImpervaPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return impervaSync{id: res.JSON200.Id.String(), site: site, cp: cp}
}

func (s impervaSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncImpervaPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestImpervaPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should set the certificate as the website's custom certificate for its key type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newImpervaSync(t, tn, g, cert, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetImpervaPkiSync, s.id, nil)
		site := s.cp.State(t).Sites[s.site]
		require.Len(t, site.Certificates, 1)
		uploaded := site.Certificates["RSA"]
		require.NotNil(t, uploaded, "the RSA slot should hold the certificate")
		require.True(t, strings.HasPrefix(uploaded.Certificate, strings.TrimSpace(cert.Certificate)))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(uploaded.PrivateKey))
		require.False(t, uploaded.MismatchSite)
	})

	t.Run("should replace the website's certificate with a renewed one without clearing the slot", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newImpervaSync(t, tn, g, cert, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetImpervaPkiSync, s.id, nil)
		mark := s.cp.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetImpervaPkiSync, s.id, done.LastSyncedAt)
		s.cp.ExpectEvent[imperva.CustomCertificateUploaded](t, func(e imperva.CustomCertificateUploaded) bool {
			return e.Site == s.site && e.AuthType == "RSA"
		}, fakenet.Since(mark))
		s.cp.ExpectNoEvent[imperva.CustomCertificateDeleted](t, nil, fakenet.Since(mark))
		site := s.cp.State(t).Sites[s.site]
		require.Len(t, site.Certificates, 1)
		require.True(t, strings.HasPrefix(site.Certificates["RSA"].Certificate, strings.TrimSpace(renewed.JSON200.Certificate)))
	})

	t.Run("should clear the website's custom certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newImpervaSync(t, tn, g, cert, nil)
		cloudSyncSucceeded(t, tn.Admin.API.GetImpervaPkiSync, s.id, nil)

		// Action
		res, err := tn.Admin.API.RemoveImpervaPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.cp.ExpectEvent[imperva.CustomCertificateDeleted](t, func(e imperva.CustomCertificateDeleted) bool {
			return e.Site == s.site && e.AuthType == "RSA"
		}, cloudSyncRemoval)
		require.Empty(t, s.cp.State(t).Sites[s.site].Certificates)
	})

	t.Run("should mark the certificate failed with Imperva's reason and what Imperva requires when it refuses the upload", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(cp *imperva.ControlPlane, site string) {
			cp.Fail(t, http.MethodPut, "/api/prov/v2/sites/"+site+"/customCertificate", http.StatusBadRequest,
				fakenet.Body(`{"errors":[{"status":400,"title":"Bad Request","detail":"Invalid input"}]}`))
		}

		// Action
		s := newImpervaSync(t, tn, g, cert, refuse)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetImpervaPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync to Imperva: Bad Request: Invalid input. Imperva rejected the certificate. It has to cover at "+
			"least one domain the website serves, and its key has to be RSA under 4096 bits or ECDSA P-256", failureMessage(t, tn, s.id))
		require.Empty(t, s.cp.State(t).Sites[s.site].Certificates)
	})
}
