package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// These pin the new privilege system, which every new organization uses: holding the
// action is the authorization, and assigning roles needs its own actions.
func TestProjectMembership_PrivilegeBoundary(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// memberManager holds member read, edit and delete and nothing else, so it is
	// strictly weaker than the project admin it acts on.
	memberManager := func(t *testing.T, proj *fixture.Project) *harness.Principal {
		t.Helper()
		proj.NewRole(t, "member-manager", fixture.Permission{Subject: "member", Action: []string{"read", "edit", "delete"}})
		actor := proj.Tenant().NewMachineIdentity(t)
		proj.Grant(t, actor, "member-manager")
		return actor
	}

	t.Run("should let a weaker member remove an admin member when it holds member delete", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		target := proj.NewUser(t, fixture.WithRoles("admin"))
		actor := memberManager(t, proj)

		// Action
		res, err := actor.API.DeleteProjectMembershipWithResponse(t.Context(), proj.ID, membershipID(t, proj, target))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, userRoles(t, proj, target))
	})

	t.Run("should refuse setting an admin member to no-access without the role assignment actions", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		target := proj.NewUser(t, fixture.WithRoles("admin"))
		actor := memberManager(t, proj)

		// Action
		res := setUserRoles(t, proj, actor, target, permanent("no-access"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "more privileged member")
		require.Equal(t, []string{"admin"}, slugs(userRoles(t, proj, target)))
	})

	t.Run("should refuse downgrading an admin member to viewer without the role assignment actions", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		target := proj.NewUser(t, fixture.WithRoles("admin"))
		actor := memberManager(t, proj)

		// Action
		res := setUserRoles(t, proj, actor, target, permanent("viewer"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, []string{"admin"}, slugs(userRoles(t, proj, target)))
	})

	t.Run("should let a project member remove an admin identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		target := tn.NewMachineIdentity(t)
		proj.Grant(t, target, "admin")
		actor := tn.NewMachineIdentity(t)
		proj.Grant(t, actor, "member")

		// Action
		res, err := actor.API.DeleteProjectIdentityMembershipWithResponse(t.Context(), proj.ID, target.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		listed, err := tn.Admin.API.ListProjectIdentityMembershipsWithResponse(t.Context(), proj.ID, nil)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		for _, m := range listed.JSON200.IdentityMemberships {
			require.NotEqual(t, target.ID.String(), m.IdentityId, "the admin identity is still a member")
		}
	})
}

func TestProjectMembership_GroupRole(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give a user who is a member only through a group the group's viewer role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		res := createSecret(t, tn.Admin.API, proj, "dev", "/", "GROUPED", "grouped-value")
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		user := tn.NewUser(t, harness.WithName("grouped"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, user)

		// Action
		proj.GrantGroup(t, group, "viewer")

		// Assert
		listed := listSecrets(t, user.API, proj, "dev", "/")
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Len(t, listed.JSON200.Secrets, 1)
		require.Equal(t, "grouped-value", listed.JSON200.Secrets[0].SecretValue)
		refused := createSecret(t, user.API, proj, "dev", "/", "FROM_VIEWER", "v")
		requireStatus(t, http.StatusForbidden, refused.StatusCode(), refused.Body)
		require.Equal(t, []string{"GROUPED"}, keysOf(listSecrets(t, tn.Admin.API, proj, "dev", "/")))
	})

	t.Run("should let a user who is a member only through a group write when the group holds member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		user := tn.NewUser(t, harness.WithName("grouped"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, user)

		// Action
		proj.GrantGroup(t, group, "member")

		// Assert
		created := createSecret(t, user.API, proj, "dev", "/", "FROM_MEMBER", "v")
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		require.Equal(t, []string{"FROM_MEMBER"}, keysOf(listSecrets(t, tn.Admin.API, proj, "dev", "/")))
	})
}
