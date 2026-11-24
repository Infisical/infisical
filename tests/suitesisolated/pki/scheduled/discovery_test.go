package scheduled_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// newNetworkDiscovery creates a discovery of one name fakenet answers TLS for on 443.
func newNetworkDiscovery(t *testing.T, tn *harness.Tenant, proj *pki.Project, autoScan bool) uuid.UUID {
	t.Helper()
	body := api.CreatePkiDiscoveryJSONRequestBody{
		ProjectId:         new(proj.ID.String()),
		Name:              "discovery-" + id.Short(),
		DiscoveryType:     new(api.CreatePkiDiscoveryJSONBodyDiscoveryTypeNetwork),
		IsAutoScanEnabled: new(autoScan),
		ScanIntervalDays:  new(float32(1)),
	}
	body.TargetConfig.Domains = &[]string{id.Short() + ".disc.test"}
	body.TargetConfig.Ports = new("443")
	res, err := tn.Admin.API.CreatePkiDiscoveryWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a discovery returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id
}

func latestScan(t *testing.T, tn *harness.Tenant, discoveryID uuid.UUID) *api.GetPkiDiscoveryLatestScanResponse {
	t.Helper()
	res, err := tn.Admin.API.GetPkiDiscoveryLatestScanWithResponse(t.Context(), discoveryID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the latest scan returned %s", apierr.Body(res.Body))
	return res
}

func TestDiscoveryScheduledScanJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should scan a discovery with automatic scans on that has never been scanned", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		discoveryID := newNetworkDiscovery(t, tn, pki.CertManager(t, tn), true)

		// Action
		runJob(t, h, api.PkiDiscoveryScheduledScan)

		// Assert
		got := pki.ScanFinished(t, tn.Admin, discoveryID)
		require.Equal(t, "completed", got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		require.Equal(t, float32(1), *got.JSON200.TargetsScannedCount)
	})

	t.Run("should not scan a discovery with automatic scans off", func(t *testing.T) {
		spec.Why(t, `The run queues each scan as its own job, so the due discovery's scan finishing does not
			show the other was never queued. A wrongly queued scan starts within the window and records a scan.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		manual := newNetworkDiscovery(t, tn, proj, false)
		due := newNetworkDiscovery(t, tn, proj, true)

		// Action
		runJob(t, h, api.PkiDiscoveryScheduledScan)

		// Assert
		pki.ScanFinished(t, tn.Admin, due)
		_, err := wait.For(t.Context(), func(ctx context.Context) (struct{}, bool, error) {
			res, err := tn.Admin.API.GetPkiDiscoveryLatestScanWithResponse(ctx, manual)
			if err != nil {
				return struct{}{}, false, err
			}
			return struct{}{}, res.StatusCode() == http.StatusOK && strings.TrimSpace(string(res.Body)) != "null", nil
		}, wait.Timeout(10*time.Second))
		require.ErrorIs(t, err, wait.ErrTimeout, "the run scanned a discovery with automatic scans off")
		require.Equal(t, "null", strings.TrimSpace(string(latestScan(t, tn, manual).Body)), "the run scanned a discovery with automatic scans off")
	})
}
