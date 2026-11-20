package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestMachineIdentity_ProjectAccess(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give an identity project access through a group alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "GROUPED", "value")
		identity := tn.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, group, "viewer")
		status, body := listSecrets(t, identity.API, proj)
		requireStatus(t, http.StatusForbidden, status, body)

		// Action
		group.AddIdentity(t, identity)

		// Assert
		body = waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, identity.API, proj) })
		require.Contains(t, string(body), "GROUPED")
	})

	t.Run("should remove an identity's project access when it leaves the group that gave it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "GROUPED", "value")
		identity := tn.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, group, "viewer")
		group.AddIdentity(t, identity)
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, identity.API, proj) })

		// Action
		group.RemoveIdentity(t, identity)

		// Assert
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return listSecrets(t, identity.API, proj) })
		require.Contains(t, string(body), "You are not a member of this project")
	})
}

func listSecrets(t *testing.T, c *api.ClientWithResponses, proj *fixture.Project) (int, []byte) {
	t.Helper()
	res, err := c.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:   &proj.ID,
		Environment: new("dev"),
		SecretPath:  new("/"),
	})
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}
