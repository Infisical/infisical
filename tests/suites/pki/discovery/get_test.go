package discovery_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestPkiDiscovery_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse another organization the discovery and a scan of it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] An unknown id answers 404 and another organization's id 403 naming the
			project, which tells a caller the id exists.`)

		// Setup
		owner, outsider := h.NewTenant(t), h.NewTenant(t)
		discovery := newDiscovery(t, owner, pki.CertManager(t, owner), "443", targetName())

		// Action
		res, err := outsider.Admin.API.GetPkiDiscoveryWithResponse(t.Context(), discovery)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
		scan, err := outsider.Admin.API.TriggerPkiDiscoveryScanWithResponse(t.Context(), discovery)
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, scan.StatusCode(), "answered: %s", apierr.Body(scan.Body))
		state, err := owner.Admin.API.GetPkiDiscoveryWithResponse(t.Context(), discovery)
		require.NoError(t, err)
		require.Nil(t, state.JSON200.LastScanStatus)
	})
}
