package syncs_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/nutanix"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// nutanixSync is an auto-syncing sync into the certificate slot of cluster-1.
type nutanixSync struct {
	id string
	pc *nutanix.ControlPlane
}

// newNutanixSync creates the sync over a new Prism Central connection; prepare runs on
// Prism before Infisical is handed the sync, to seed or fail something.
func newNutanixSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, prepare func(*nutanix.ControlPlane)) nutanixSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.NutanixPrismCentralBasicAuthAppConnection)
	pc := nutanix.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	pc.Seed(t, nutanix.WithCluster("cluster-1", "prod"))
	if prepare != nil {
		prepare(pc)
	}
	body := api.CreateNutanixPrismCentralPkiSyncJSONRequestBody{
		Name:           "nutanix-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.ClusterId = "cluster-1"
	body.DestinationConfig.ClusterName = "prod"
	res, err := tn.Admin.API.CreateNutanixPrismCentralPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return nutanixSync{id: res.JSON200.Id.String(), pc: pc}
}

func (s nutanixSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncNutanixPrismCentralPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestNutanixPrismCentralPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should replace the cluster's certificate with the certificate, its chain and key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newNutanixSync(t, tn, g, cert, nil)

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetNutanixPrismCentralPkiSync, s.id, nil)
		cluster := s.pc.State(t).Clusters["cluster-1"]
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(cluster.PublicCertificate))
		require.Equal(t, strings.TrimSpace(cert.Chain), strings.TrimSpace(cluster.CaChain))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(cluster.PrivateKey))
		require.Equal(t, "RSA_2048", cluster.KeyAlgorithm)
		require.Equal(t, 2, cluster.Version, "the PUT should carry the ETag of the certificate it replaced")
	})

	t.Run("should replace the cluster's certificate again with a renewed certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newNutanixSync(t, tn, g, cert, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetNutanixPrismCentralPkiSync, s.id, nil)
		mark := s.pc.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetNutanixPrismCentralPkiSync, s.id, done.LastSyncedAt)
		s.pc.ExpectEvent[nutanix.CertificateReplaced](t, func(e nutanix.CertificateReplaced) bool { return e.ClusterID == "cluster-1" }, fakenet.Since(mark))
		cluster := s.pc.State(t).Clusters["cluster-1"]
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, pki.ParseLeaf(t, cluster.PublicCertificate).Raw)
	})

	t.Run("should mark the certificate failed with Prism's reason when Prism refuses the certificate", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A refused upload is retried by the queue, so the sync's own status stays running for
			about a minute; the certificate's row records the failure on the first attempt.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		refuse := func(pc *nutanix.ControlPlane) {
			pc.Fail(t, http.MethodPut, "/api/clustermgmt/v4.2/config/clusters/cluster-1/ssl-certificate", http.StatusBadRequest,
				fakenet.Body(`{"data":{"error":[{"code":"CLU-10002","message":"The private key does not match the public certificate","severity":"ERROR"}]},"message":"The private key does not match the public certificate"}`))
		}

		// Action
		s := newNutanixSync(t, tn, g, cert, refuse)

		// Assert
		require.Equal(t, "Failed to upload certificate to Nutanix cluster cluster-1: The private key does not match the public certificate", nutanixFailureMessage(t, tn, s.id))
		require.Empty(t, s.pc.State(t).Clusters["cluster-1"].PublicCertificate)
	})
}

func TestNutanixPrismCentralPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report that certificates cannot be removed from Prism Central", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A cluster always presents one certificate, so there is nothing to remove it to; the
			destination registers no remove-certificates route.`)

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.ListPkiSyncOptionsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing the sync options returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		for _, o := range res.JSON200.PkiSyncOptions {
			if string(o.Destination) == "nutanix-prism-central" {
				require.False(t, o.CanRemoveCertificates)
				return
			}
		}
		require.FailNow(t, "the sync options do not list Nutanix Prism Central")
	})
}

// nutanixFailureMessage waits for the sync's one certificate row to be marked failed and
// returns the message it records.
func nutanixFailureMessage(t *testing.T, tn *harness.Tenant, syncID string) string {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (string, bool, error) {
		res, err := tn.Admin.API.ListPkiSyncCertificatesWithResponse(ctx, uuid.MustParse(syncID), nil)
		if err != nil {
			return "", false, err
		}
		if res.JSON200 == nil {
			return "", false, fmt.Errorf("listing the sync's certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		}
		if len(res.JSON200.Certificates) != 1 {
			return "", false, fmt.Errorf("the sync holds %d certificates, want 1", len(res.JSON200.Certificates))
		}
		c := res.JSON200.Certificates[0]
		if c.SyncStatus != api.ListPkiSyncCertificates200JSONResponseBodyCertificatesSyncStatusFailed || c.LastSyncMessage == nil {
			return "", false, nil
		}
		return *c.LastSyncMessage, true, nil
	})
	require.NoError(t, err, "waiting for the certificate to be marked failed")
	return got
}
