package dynamicsecrets_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestPostgresDynamicSecret_Lease(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a role that can log in, and drop it on revoke", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, postgresProvider(target))
		l := ds.lease(t, nil, "")
		username, password := credentials(t, l)
		target.DropRoleAtCleanup(t, username)
		require.NoError(t, target.Login(t, username, password), "the leased credential does not log in")

		// Action
		res := ds.revoke(t, tn.Admin.API, l.ID, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.False(t, target.RoleExists(t, username), "the revoked lease's role is still on the database")
		require.Error(t, target.Login(t, username, password))
	})

	t.Run("should render the identity name into the role name when the template uses it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ci := proj.NewMachineIdentity(t, fixture.WithPrincipalName("ci-"+id.Short()), fixture.WithRoles("admin"))
		ds := newDynamicSecret(t, proj, postgresProvider(target), usernameTemplate("{{identity.name}}-{{randomUsername}}"))

		// Action
		l := ds.lease(t, ci, "")

		// Assert
		username, password := credentials(t, l)
		target.DropRoleAtCleanup(t, username)
		require.True(t, strings.HasPrefix(username, ci.Name+"-"), "%q does not start with the identity name %q", username, ci.Name)
		require.NoError(t, target.Login(t, username, password))
	})
}
