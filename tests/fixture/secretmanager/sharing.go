package secretmanager

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// AllowCrossProjectSharing sets the organization toggle that cross-project imports and
// references need on top of the plan.
func AllowCrossProjectSharing(tt *testing.T, tn *harness.Tenant, allowed bool) {
	tt.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(tt.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{AllowCrossProjectSecretSharing: &allowed})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "setting cross-project sharing returned %d: %s",
		res.StatusCode(), apierr.Body(res.Body))
}

// GrantFolder lets target read source's folder at env and path. It returns the grant's
// ID.
func GrantFolder(tt *testing.T, source, target *fixture.Project, from Location) string {
	tt.Helper()
	res, err := source.Tenant().Admin.API.CreateProjectFolderGrantWithResponse(tt.Context(),
		api.CreateProjectFolderGrantJSONRequestBody{
			SourceProjectId: source.ID,
			TargetProjectId: target.ID,
			Environment:     from.Env,
			SecretPath:      from.Path,
		})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "granting %s:%s returned %d: %s", from.Env, from.Path,
		res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Grant.Id.String()
}
