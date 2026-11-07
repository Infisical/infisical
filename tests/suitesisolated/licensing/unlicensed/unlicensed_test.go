package unlicensed_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestUnlicensedInstance_Plan(t *testing.T) {
	h := harness.From(t)

	t.Run("should serve the OSS defaults to every org", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Nil(t, plan["slug"])
		require.Equal(t, false, plan["rbac"])
		require.Equal(t, plan, fixture.Plan(t, other.Admin.API, other.OrgID.String(), true))
	})

	t.Run("should refuse a paid feature", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: "unlicensed"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "plan restriction")
	})

	t.Run("should send nothing to the License Server, even when an org is deleted", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		org := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Action
		res, err := tn.Admin.API.DeleteOrganizationWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Empty(t, org.Calls(t))
	})
}
