package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// chefSync is an auto-syncing Chef sync writing to the "certificates" data bag.
type chefSync struct {
	id string
	cp *chef.ControlPlane
}

// newChefSync creates the sync over a new Chef connection; prepare runs on the user
// before Infisical is handed the sync, to seed or fail something.
func newChefSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*chef.ControlPlane), preserveItemOnRenewal *bool) chefSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.ChefUserKeyAppConnection(t))
	cp := chef.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	cp.Seed(t, chef.WithDataBag("certificates"))
	if prepare != nil {
		prepare(cp)
	}
	body := api.CreateChefPkiSyncJSONRequestBody{
		Name:           "chef-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.DataBagName = "certificates"
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	body.SyncOptions.PreserveItemOnRenewal = preserveItemOnRenewal
	res, err := tn.Admin.API.CreateChefPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return chefSync{id: res.JSON200.Id.String(), cp: cp}
}

func (s chefSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncChefPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// chefItemName is the item name "Infisical-{{certificateId}}" gives a certificate.
func chefItemName(certID string) string {
	return "Infisical-" + strings.ReplaceAll(certID, "-", "")
}

func TestChefPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write a data bag item holding the certificate, its chain and its key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newChefSync(t, tn, g, cert, nil, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, nil)
		items := s.cp.State(t).DataBags["certificates"]
		require.Len(t, items, 1)
		for name, item := range items {
			require.Equal(t, name, item["id"])
			require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(item["certificate"].(string)))
			require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(item["private_key"].(string)))
			require.Contains(t, item["certificate_chain"], syncedIntermediate(t, cert))
		}
	})

	t.Run("should overwrite the same data bag item with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newChefSync(t, tn, g, cert, nil, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, nil)
		item := chefItemName(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, done.LastSyncedAt)
		s.cp.ExpectEvent[chef.DataBagItemUpdated](t, func(e chef.DataBagItemUpdated) bool { return e.Item == item })
		items := s.cp.State(t).DataBags["certificates"]
		require.Len(t, items, 1)
		require.Contains(t, items, item)
		require.Equal(t, strings.TrimSpace(renewed.JSON200.Certificate), strings.TrimSpace(items[item]["certificate"].(string)))
	})

	t.Run("should write a renewed certificate to a new item and delete the old one when preserving the item is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newChefSync(t, tn, g, cert, nil, new(false))
		done := cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, nil)
		old := chefItemName(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, done.LastSyncedAt)
		s.cp.ExpectEvent[chef.DataBagItemDeleted](t, func(e chef.DataBagItemDeleted) bool { return e.Item == old })
		items := s.cp.State(t).DataBags["certificates"]
		fresh := chefItemName(renewed.JSON200.CertificateId)
		require.Len(t, items, 1)
		require.Contains(t, items, fresh)
		require.Equal(t, strings.TrimSpace(renewed.JSON200.Certificate), strings.TrimSpace(items[fresh]["certificate"].(string)))
	})

	t.Run("should delete the sync's data bag item and leave items Infisical did not write", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		unmanaged := map[string]any{"dataBags": map[string]any{"certificates": map[string]any{"web": map[string]any{"id": "web"}}}}
		s := newChefSync(t, tn, g, cert, func(cp *chef.ControlPlane) { cp.Seed(t, unmanaged) }, nil)
		cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, s.id, nil)
		item := chefItemName(cert.ID.String())

		// Action
		res, err := tn.Admin.API.RemoveChefPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.cp.ExpectEvent[chef.DataBagItemDeleted](t, func(e chef.DataBagItemDeleted) bool { return e.Item == item }, cloudSyncRemoval)
		items := s.cp.State(t).DataBags["certificates"]
		require.Len(t, items, 1)
		require.Contains(t, items, "web")
	})

	t.Run("should mark the certificate failed with the failed call when Chef refuses the item", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Infisical keeps only axios's status line, so the reason Chef gives in its
			error body never reaches the sync row.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(cp *chef.ControlPlane) {
			cp.Fail(t, http.MethodPost, "/organizations/*", http.StatusForbidden,
				fakenet.Body(`{"error":["missing create permission"]}`))
		}

		// Action
		s := newChefSync(t, tn, g, cert, refuse, nil)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetChefPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Failed to create Chef data bag item: Request failed with status code 403", failureMessage(t, tn, s.id))
		require.Empty(t, s.cp.State(t).DataBags["certificates"])
	})
}
