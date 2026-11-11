package fixture

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func Plan(tt *testing.T, client *api.ClientWithResponses, orgID string, refresh bool) map[string]any {
	tt.Helper()
	params := &api.GetOrganizationPlanParams{}
	if refresh {
		v := api.GetOrganizationPlanParamsRefreshCache("true")
		params.RefreshCache = &v
	}
	res, err := client.GetOrganizationPlanWithResponse(tt.Context(), orgID, params)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "reading the plan: %s", apierr.Body(res.Body))
	plan, ok := res.JSON200.Plan.(map[string]any)
	require.Truef(tt, ok, "plan came back as %T", res.JSON200.Plan)
	return plan
}
