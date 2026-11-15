package offline_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestOfflineLicense_Plan(t *testing.T) {
	h := harness.From(t)

	t.Run("should serve the license's entitlements to every org", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Equal(t, "enterprise", plan["slug"])
		require.Equal(t, true, plan["isOffline"])
		require.Equal(t, true, plan["rbac"])
		require.Equal(t, false, plan["secretRotation"], "the license leaves secret rotation out")
		require.Equal(t, plan["rbac"], fixture.Plan(t, other.Admin.API, other.OrgID.String(), true)["rbac"])
	})

	t.Run("should send nothing to the License Server", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		admin := fixture.FakenetAdmin(t, tn)
		scopes := append(license.SelfHostedScopes(t, admin, licenseKey), license.Open(t, admin, tn.OrgID.String()))
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.DeleteOrganizationWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		license.ExpectNothingSent(t, scopes)
	})

	t.Run("should report offline usage reports as available to an instance admin", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)

		// Action
		res, err := admin.API.GetAdminConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNil(t, res.JSON200)
		require.NotNil(t, res.JSON200.Config.IsOfflineUsageReportsEnabled)
		require.True(t, *res.JSON200.Config.IsOfflineUsageReportsEnabled)
	})
}
