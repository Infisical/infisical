package online_test

import (
	"context"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func TestOnlineLicense_Plan(t *testing.T) {
	h := harness.From(t)

	t.Run("should serve the License Server's entitlements to every org", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Equal(t, "enterprise", plan["slug"])
		require.Equal(t, true, plan["rbac"])
		require.Equal(t, plan["rbac"], fixture.Plan(t, other.Admin.API, other.OrgID.String(), false)["rbac"])
	})

	t.Run("should take a new plan from the License Server when the cache is refreshed", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		key := license.Open(t, fixture.FakenetAdmin(t, tn), licenseKey)
		key.Seed(t, license.Enterprise().Without(license.RBAC))
		t.Cleanup(func() {
			// The instance holds one plan for every org, so later tests need it back.
			key.Seed(t, license.Enterprise())
			refresh := api.GetOrganizationPlanParamsRefreshCache("true")
			_, _ = tn.Admin.API.GetOrganizationPlanWithResponse(context.Background(), tn.OrgID.String(),
				&api.GetOrganizationPlanParams{RefreshCache: &refresh})
		})

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Equal(t, false, plan["rbac"])
	})

	t.Run("should report usage for the whole instance under the license", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		key := license.Open(t, fixture.FakenetAdmin(t, tn), licenseKey)

		// Action
		tn.NewMachineIdentity(t)

		// Assert
		got := key.ExpectEvent[license.SnapshotReceived](t, func(e license.SnapshotReceived) bool {
			return e.Dimension == "identities" && e.Value >= 1
		}, fakenet.Within(30*time.Second))
		require.Equal(t, "self-hosted", got.Source)
	})
}
