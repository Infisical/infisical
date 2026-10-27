package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestGroup_GrantsProjectAccessToItsUsers(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Group approvers and bypassers are only meaningful if membership really
		reaches the project; a fixture that created the group but dropped the user or the
		grant would make every group test pass for the wrong reason.`)

	// Setup
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
	member := tn.NewUser(t, harness.WithName("grouped"))
	read := func() int {
		res, err := member.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})
		require.NoError(t, err)
		return res.StatusCode()
	}
	require.NotEqual(t, http.StatusOK, read(), "the user could read the project before joining the group")

	// Action
	group := fixture.NewGroup(t, tn)
	group.AddUser(t, member)
	proj.GrantGroup(t, group)

	// Assert
	require.Equal(t, http.StatusOK, read())
}
