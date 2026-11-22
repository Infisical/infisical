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

// FolderTier is a folder access level. Each tier includes the ones before it.
type FolderTier string

const (
	FolderList       FolderTier = "list"
	FolderRead       FolderTier = "read"
	FolderEdit       FolderTier = "edit"
	FolderManage     FolderTier = "manage"
	FolderFullAccess FolderTier = "full-access"
)

// GrantFolderAccess gives a project member, user or machine identity, permanent access
// to one folder. The folder must exist.
func GrantFolderAccess(tt *testing.T, p *fixture.Project, member *harness.Principal, at Location, tier FolderTier) {
	tt.Helper()
	ctx, admin := tt.Context(), p.Tenant().Admin.API

	var status int
	var body []byte
	if member.Kind == harness.MachineIdentity {
		res, err := admin.CreateIdentityFolderAccessWithResponse(ctx, p.ID, member.ID,
			api.CreateIdentityFolderAccessJSONRequestBody{
				EnvironmentSlug: at.Env,
				SecretPath:      at.Path,
				Permission:      api.CreateIdentityFolderAccessJSONBodyPermission(tier),
			})
		require.NoError(tt, err)
		status, body = res.StatusCode(), res.Body
	} else {
		res, err := admin.CreateUserFolderAccessWithResponse(ctx, p.ID, member.ID,
			api.CreateUserFolderAccessJSONRequestBody{
				EnvironmentSlug: at.Env,
				SecretPath:      at.Path,
				Permission:      api.CreateUserFolderAccessJSONBodyPermission(tier),
			})
		require.NoError(tt, err)
		status, body = res.StatusCode(), res.Body
	}
	require.Equalf(tt, http.StatusOK, status, "granting %s %s on %s:%s returned %d: %s",
		member.Name, tier, at.Env, at.Path, status, apierr.Body(body))
}
