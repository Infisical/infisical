package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// gcpSync is an auto-syncing GCP Certificate Manager sync in its own GCP project.
type gcpSync struct {
	id       string
	project  string
	location string
	gcp      *oauth.GCPControlPlane
}

// gcpSyncSetup configures newGCPSync. A certificate map binds the sync to the "lb" map
// in the global location, which map binding requires; without one the sync targets
// us-central1.
type gcpSyncSetup struct {
	certificateMap        bool
	preserveItemOnRenewal *bool
	// prepare runs before Infisical is handed the sync, to seed or fail something.
	prepare func(cm *fakenet.Scope[oauth.CertificateManager], project string)
}

func newGCPSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, setup gcpSyncSetup) gcpSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.GCPServiceAccountAppConnection(tn))
	s := gcpSync{
		project:  "proj-" + strings.ToLower(id.Short()),
		location: "us-central1",
		gcp:      oauth.OpenGCP(t, conn.FakenetAdmin(t), fixture.GCPServiceAccountEmail(tn, conn.Nonce())),
	}
	body := api.CreateGcpCertificateManagerPkiSyncJSONRequestBody{
		Name:           "gcp-" + id.Short(),
		ConnectionId:   conn.ID,
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	if setup.certificateMap {
		s.location = "global"
		s.gcp.CertificateManager.Seed(t, oauth.SeedGCPCertificateMap(s.project, "lb"))
		fromJSON(t, &body.DestinationConfig.CertificateMapBinding, map[string]any{
			"certificateMap": "lb",
			"hostname":       pki.ParseLeaf(t, cert.Certificate).DNSNames[0],
		})
	}
	if setup.prepare != nil {
		setup.prepare(s.gcp.CertificateManager, s.project)
	}
	body.DestinationConfig.GcpProjectId = s.project
	body.DestinationConfig.Location = s.location
	body.SyncOptions.CertificateNameSchema = "infisical-{{certificateId}}"
	body.SyncOptions.PreserveItemOnRenewal = setup.preserveItemOnRenewal
	res, err := tn.Admin.API.CreateGcpCertificateManagerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	s.id = res.JSON200.Id.String()
	return s
}

func (s gcpSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncGcpCertificateManagerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// certificate is the resource name "infisical-{{certificateId}}" gives a certificate.
func (s gcpSync) certificate(certID string) string {
	return "projects/" + s.project + "/locations/" + s.location + "/certificates/infisical-" + strings.ReplaceAll(certID, "-", "")
}

// entry is the resource name of the map entry the sync owns in the "lb" map.
func (s gcpSync) entry() string {
	return "projects/" + s.project + "/locations/global/certificateMaps/lb/certificateMapEntries/infisical-" + s.id
}

func TestGcpCertificateManagerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create the certificate in the configured project and location and wait for its operation to finish", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newGCPSync(t, tn, g, cert, gcpSyncSetup{})

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, nil)
		state := s.gcp.CertificateManager.State(t)
		require.Len(t, state.Certificates, 1)
		for name, created := range state.Certificates {
			require.True(t, strings.HasPrefix(name, "projects/"+s.project+"/locations/us-central1/certificates/"), "created at %s", name)
			require.True(t, strings.HasPrefix(created.PemCertificate, strings.TrimSpace(cert.Certificate)))
			require.Equal(t, "infisical", created.Labels["managed-by"])
			s.gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateCreated](t, func(e oauth.GCPCertificateCreated) bool { return e.Name == name })
		}
		for name, op := range state.Operations {
			require.Truef(t, op.Done, "Infisical never polled operation %s", name)
		}
	})

	t.Run("should patch the same certificate with a renewed certificate and leave the map entry pointing at it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newGCPSync(t, tn, g, cert, gcpSyncSetup{certificateMap: true})
		done := cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, nil)
		name := s.certificate(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, done.LastSyncedAt)
		s.gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateUpdated](t, func(e oauth.GCPCertificateUpdated) bool { return e.Name == name })
		state := s.gcp.CertificateManager.State(t)
		require.Len(t, state.Certificates, 1)
		require.Contains(t, state.Certificates, name)
		require.True(t, strings.HasPrefix(state.Certificates[name].PemCertificate, strings.TrimSpace(renewed.JSON200.Certificate)))
		require.Equal(t, []string{name}, state.CertificateMapEntries[s.entry()].Certificates)
	})

	t.Run("should point the map entry at a new certificate and delete the old one when preserving the item is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newGCPSync(t, tn, g, cert, gcpSyncSetup{certificateMap: true, preserveItemOnRenewal: new(false)})
		done := cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, nil)
		old := s.certificate(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, done.LastSyncedAt)
		s.gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateDeleted](t, func(e oauth.GCPCertificateDeleted) bool { return e.Name == old })
		state := s.gcp.CertificateManager.State(t)
		fresh := s.certificate(renewed.JSON200.CertificateId)
		require.Len(t, state.Certificates, 1)
		require.Contains(t, state.Certificates, fresh)
		require.True(t, strings.HasPrefix(state.Certificates[fresh].PemCertificate, strings.TrimSpace(renewed.JSON200.Certificate)))
		require.Equal(t, []string{fresh}, state.CertificateMapEntries[s.entry()].Certificates)
	})

	t.Run("should delete the sync's map entry and then its certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newGCPSync(t, tn, g, cert, gcpSyncSetup{certificateMap: true})
		cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, nil)
		mark := s.gcp.CertificateManager.Mark(t)

		// Action
		res, err := tn.Admin.API.RemoveGcpCertificateManagerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateMapEntryDeleted](t, func(e oauth.GCPCertificateMapEntryDeleted) bool { return e.Name == s.entry() }, fakenet.Since(mark), cloudSyncRemoval)
		s.gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateDeleted](t, func(e oauth.GCPCertificateDeleted) bool { return e.Name == s.certificate(cert.ID.String()) }, fakenet.Since(mark))
		state := s.gcp.CertificateManager.State(t)
		require.Empty(t, state.Certificates)
		require.Empty(t, state.CertificateMapEntries)
	})

	t.Run("should mark the certificate failed with GCP's reason when GCP rejects the upload", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		reject := func(cm *fakenet.Scope[oauth.CertificateManager], project string) {
			cm.Fail(t, http.MethodPost, "/v1/projects/"+project+"/locations/us-central1/certificates", http.StatusBadRequest,
				fakenet.Body(`{"error":{"code":400,"message":"The certificate chain is not valid.","status":"INVALID_ARGUMENT"}}`))
		}

		// Action
		s := newGCPSync(t, tn, g, cert, gcpSyncSetup{prepare: reject})

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, s.id, nil, "failed")
		require.Equal(t, `Failed to sync certificate: GCP rejected the certificate upload: The certificate chain is not valid. for certificate "infisical-`+
			strings.ReplaceAll(cert.ID.String(), "-", "")+`"`, failureMessage(t, tn, s.id))
		require.Empty(t, s.gcp.CertificateManager.State(t).Certificates)
	})
}
