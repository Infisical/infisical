package folderaccess_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

const onlyRootRecursive = "Only folder access on the root folder '/' can apply to subfolders"

func TestFolderAccess_Recursive(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, k := range kinds {
		t.Run(fmt.Sprintf("should keep a %s's root grant recursive on a role change and stop when recursion is turned off", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			member := k.member(t, proj, "no-access")
			admin := proj.Tenant().Admin
			created := grantAs(t, admin, proj, member, at("/"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})
			require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)

			// Action
			roleOnly := updateGrant(t, admin, proj, member, at("/"), map[string]any{"permission": "edit"})
			turnedOff := updateGrant(t, admin, proj, member, at("/"), map[string]any{"isPermissionRecursive": false})

			// Assert
			require.True(t, created.grant.IsPermissionRecursive)
			require.Equalf(t, http.StatusOK, roleOnly.status, "changing the role: %s", roleOnly.body)
			require.Equal(t, "edit", roleOnly.grant.Permission)
			require.True(t, roleOnly.grant.IsPermissionRecursive)
			require.Equalf(t, http.StatusOK, turnedOff.status, "turning recursion off: %s", turnedOff.body)
			require.Equal(t, "edit", turnedOff.grant.Permission)
			require.False(t, turnedOff.grant.IsPermissionRecursive)
			grants := grantsOf(t, proj, member)
			require.Len(t, grants, 1)
			require.False(t, grants[0].IsPermissionRecursive)
		})

		t.Run(fmt.Sprintf("should refuse recursion for a %s on a folder other than root and keep the grant unchanged", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			member := k.member(t, proj, "no-access")
			admin := proj.Tenant().Admin

			// Action
			recursiveCreate := grantAs(t, admin, proj, member, at("/app"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})
			afterCreate := grantsOf(t, proj, member)
			secretmanager.GrantFolderAccess(t, proj, member, at("/app"), secretmanager.FolderRead)
			turnOn := updateGrant(t, admin, proj, member, at("/app"), map[string]any{"isPermissionRecursive": true})
			turnOff := updateGrant(t, admin, proj, member, at("/app"), map[string]any{"isPermissionRecursive": false})

			// Assert
			require.Equalf(t, http.StatusBadRequest, recursiveCreate.status, "granting: %s", recursiveCreate.body)
			require.Contains(t, recursiveCreate.message, onlyRootRecursive)
			require.Empty(t, afterCreate)
			require.Equalf(t, http.StatusBadRequest, turnOn.status, "turning recursion on: %s", turnOn.body)
			require.Contains(t, turnOn.message, onlyRootRecursive)
			require.Equalf(t, http.StatusOK, turnOff.status, "turning recursion off: %s", turnOff.body)
			grants := grantsOf(t, proj, member)
			require.Len(t, grants, 1)
			require.False(t, grants[0].IsPermissionRecursive)
			require.Equal(t, "read", grants[0].Permission)
		})
	}

	t.Run("should refuse revoking a recursive root grant when the actor can manage access only on the root folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		rootManager := proj.NewUser(t, fixture.WithPrincipalName("rootmanager"))
		secretmanager.GrantFolderAccess(t, proj, rootManager, at("/"), secretmanager.FolderFullAccess)
		member := proj.NewUser(t, fixture.WithPrincipalName("member"), fixture.WithRoles("no-access"))
		created := grantAs(t, proj.Tenant().Admin, proj, member, at("/"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})
		require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)

		// Action
		res := revokeGrant(t, rootManager, proj, member, at("/"))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.status, "revoking: %s", res.body)
		require.Equal(t, "RecursiveFolderAccessNotAllowed", res.errName)
		grants := grantsOf(t, proj, member)
		require.Len(t, grants, 1)
		require.True(t, grants[0].IsPermissionRecursive)
	})

	t.Run("should list a recursive root grant as inherited on a nested folder until recursion is turned off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"), fixture.WithRoles("no-access"))
		created := grantAs(t, tn.Admin, proj, member, at("/"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})
		require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)
		id := member.ID.String()

		// Action
		root := listUsersAs(t, tn.Admin, proj, at("/"), member.Email)
		nested := listUsersAs(t, tn.Admin, proj, at("/app"), member.Email)
		turnedOff := updateGrant(t, tn.Admin, proj, member, at("/"), map[string]any{"isPermissionRecursive": false})
		require.Equalf(t, http.StatusOK, turnedOff.status, "turning recursion off: %s", turnedOff.body)
		nestedAfter := listUsersAs(t, tn.Admin, proj, at("/app"), member.Email)

		// Assert
		require.Equalf(t, http.StatusOK, root.status, "listing /: %s", root.body)
		require.NotNil(t, root.with[id].Grant)
		require.Equal(t, created.grant.ID, root.with[id].Grant.ID)
		require.Nil(t, root.with[id].Inherited)

		require.Equalf(t, http.StatusOK, nested.status, "listing /app: %s", nested.body)
		require.NotContains(t, nested.without, id)
		require.Nil(t, nested.with[id].Grant)
		require.NotNil(t, nested.with[id].Inherited)
		require.Equal(t, created.grant.ID, nested.with[id].Inherited.ID)
		require.Equal(t, "/", nested.with[id].Inherited.SecretPath)
		require.True(t, nested.with[id].Inherited.IsPermissionRecursive)

		require.NotContains(t, nestedAfter.with, id)
		require.Nil(t, nestedAfter.without[id].Inherited)
	})

	t.Run("should show a project member on the folder access list right after they are added and drop them right after removal", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		user := tn.NewUser(t, harness.WithName("joiner"))
		before := listUsersAs(t, tn.Admin, proj, at("/app"), user.Email)

		// Action
		proj.Grant(t, user)
		afterAdd := listUsersAs(t, tn.Admin, proj, at("/app"), user.Email)
		removed, err := tn.Admin.API.RemoveProjectMembersWithResponse(t.Context(), proj.ID,
			api.RemoveProjectMembersJSONRequestBody{Usernames: &[]string{strings.ToLower(user.Email)}})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, removed.StatusCode(), "removing: %s", removed.Body)
		afterRemove := listUsersAs(t, tn.Admin, proj, at("/app"), user.Email)

		// Assert
		id := user.ID.String()
		require.Equalf(t, http.StatusOK, before.status, "listing: %s", before.body)
		require.NotContains(t, before.with, id)
		require.NotContains(t, before.without, id)
		require.Contains(t, afterAdd.with, id)
		require.NotContains(t, afterRemove.with, id)
		require.NotContains(t, afterRemove.without, id)
	})
}
