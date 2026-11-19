package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestProjectLeave(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the user's membership and access when they leave", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.LeaveProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, userRoles(t, proj, viewer))
		waitForStatus(t, http.StatusForbidden, func() (int, []byte) {
			listed := listSecrets(t, viewer.API, proj, "dev", "/")
			return listed.StatusCode(), listed.Body
		})
	})

	t.Run("should refuse and keep the group's access when the user is a member only through a group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		user := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, user)
		proj.GrantGroup(t, group, "viewer")

		// Action
		res, err := user.API.LeaveProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You have access to this project through a group rather than a direct membership.")
		listed := listSecrets(t, user.API, proj, "dev", "/")
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
	})

	t.Run("should refuse a user who is not a member of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := tn.NewUser(t)

		// Action
		res, err := outsider.API.LeaveProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not a member of this project")
		require.Contains(t, slugs(userRoles(t, proj, tn.Admin)), "admin")
	})

	t.Run("should let the last admin leave a secret manager project", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Pins current behaviour: only the org-scoped products (PAM, Agent Vault) keep a last admin; "+
			"a secret manager project can be left adminless, and an org admin regains it through grant-admin-access.")

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithRoles("viewer"))

		// Action
		res, err := tn.Admin.API.LeaveProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		members, err := viewer.API.ListProjectMembershipsWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, members.StatusCode(), members.Body)
		require.Len(t, members.JSON200.Memberships, 1)
		require.Equal(t, viewer.ID, members.JSON200.Memberships[0].UserId)
	})
}
