package syncs_test

import (
	"maps"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kemp"
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

// kempSync is an auto-syncing Kemp LoadMaster sync.
type kempSync struct {
	id string
	lm *kemp.ControlPlane
}

// newKempSync creates the sync over a new Kemp LoadMaster connection, serving the
// certificate from virtualServiceID when it is set; prepare runs on the LoadMaster
// before Infisical is handed the sync, to seed or fail something.
func newKempSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*kemp.ControlPlane), virtualServiceID *string) kempSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.KempLoadMasterBasicAuthAppConnection)
	lm := kemp.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(lm)
	}
	body := api.CreateKempLoadmasterPkiSyncJSONRequestBody{
		Name:           "kemp-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.VirtualServiceId = virtualServiceID
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	res, err := tn.Admin.API.CreateKempLoadmasterPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return kempSync{id: res.JSON200.Id.String(), lm: lm}
}

func (s kempSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncKempLoadmasterPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestKempLoadMasterPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should add the certificate with its key and put its issuing CA in the intermediate store", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newKempSync(t, tn, g, cert, nil, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetKempLoadmasterPkiSync, s.id, nil)
		state := s.lm.State(t)
		bundle := state.Certificates[applianceObjectName(cert)]
		require.True(t, strings.HasPrefix(bundle, strings.TrimSpace(cert.Certificate)))
		require.Contains(t, bundle, strings.TrimSpace(cert.PrivateKey))
		var stored []string
		for _, ca := range state.Intermediates {
			stored = append(stored, strings.TrimSpace(ca))
		}
		require.Equal(t, []string{syncedIntermediate(t, cert)}, stored)
	})

	t.Run("should replace the certificate under the same identifier with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newKempSync(t, tn, g, cert, nil, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetKempLoadmasterPkiSync, s.id, nil)
		name := applianceObjectName(cert)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetKempLoadmasterPkiSync, s.id, done.LastSyncedAt)
		s.lm.ExpectEvent[kemp.CertificateAdded](t, func(e kemp.CertificateAdded) bool { return e.Name == name && e.Replaced })
		certs := s.lm.State(t).Certificates
		require.Len(t, certs, 1)
		require.True(t, strings.HasPrefix(certs[name], strings.TrimSpace(renewed.JSON200.Certificate)))
	})

	t.Run("should unbind the certificate from the Virtual Service, keeping the ones it did not add, then delete it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		seed := func(lm *kemp.ControlPlane) {
			lm.Seed(t, map[string]any{"certificates": map[string]string{"web": cert.Certificate + "\n" + cert.PrivateKey}},
				kemp.VirtualServiceAt("1", "web"))
		}
		s := newKempSync(t, tn, g, cert, seed, new("1"))
		cloudSyncSucceeded(t, tn.Admin.API.GetKempLoadmasterPkiSync, s.id, nil)
		name := applianceObjectName(cert)
		require.Equal(t, []string{"web", name}, s.lm.State(t).VirtualServices["1"].CertFiles)

		// Action
		res, err := tn.Admin.API.RemoveKempLoadmasterPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.lm.ExpectEvent[kemp.VirtualServiceModified](t, func(e kemp.VirtualServiceModified) bool {
			return e.Index == "1" && slices.Equal(e.CertFiles, []string{"web"})
		}, cloudSyncRemoval)
		s.lm.ExpectEvent[kemp.CertificateDeleted](t, func(e kemp.CertificateDeleted) bool { return e.Name == name })
		require.Equal(t, []string{"web"}, slices.Sorted(maps.Keys(s.lm.State(t).Certificates)))
	})

	t.Run("should mark the certificate failed with the failed call when the LoadMaster refuses the certificate", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] The LoadMaster answers a refused command with HTTP 422 and a fail document,
			but Infisical keeps only axios's status line, so the reason in <Error> never reaches the
			sync row. The fns parse that document only on a 2xx answer.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(lm *kemp.ControlPlane) {
			lm.Fail(t, http.MethodPost, "/access/addcert", http.StatusUnprocessableEntity,
				fakenet.Body(`<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<Response stat="422" code="fail"><Error>Invalid certificate data</Error></Response>`))
		}

		// Action
		s := newKempSync(t, tn, g, cert, refuse, nil)

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetKempLoadmasterPkiSync, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Request failed with status code 422", failureMessage(t, tn, s.id))
		require.Empty(t, s.lm.State(t).Certificates)
	})
}
