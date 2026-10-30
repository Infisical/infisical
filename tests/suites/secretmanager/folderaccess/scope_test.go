package folderaccess_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestFolderAccess_Scope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should replace the base role at the granted path only", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/a/b")
		secretmanager.CreateSecret(t, proj, "dev", "A_KEY", "a-value", secretmanager.WithPath("/a"))
		secretmanager.CreateSecret(t, proj, "dev", "B_KEY", "b-value", secretmanager.WithPath("/a/b"))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.GrantFolderAccess(t, proj, member, at("/a"), secretmanager.FolderList)

		// Action
		granted := listSecrets(t, member, proj, "/a", false)
		child := listSecrets(t, member, proj, "/a/b", false)

		// Assert
		require.Equalf(t, http.StatusForbidden, granted.status, "listing values at the granted path: %s", granted.body)
		require.NotContains(t, string(granted.body), "a-value")
		require.Equalf(t, http.StatusOK, child.status, "listing below the granted path: %s", child.body)
		require.Equal(t, map[string]string{"B_KEY": "b-value"}, child.values)
	})
}

func TestSecret_ListRecursive(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the requested folder and its descendants when listing recursively from a subfolder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/deep1/deep2")
		secretmanager.CreateFolder(t, proj, "dev", "/other")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT", "root")
		secretmanager.CreateSecret(t, proj, "dev", "DEEP1", "deep1", secretmanager.WithPath("/deep1"))
		secretmanager.CreateSecret(t, proj, "dev", "DEEP2", "deep2", secretmanager.WithPath("/deep1/deep2"))
		secretmanager.CreateSecret(t, proj, "dev", "OTHER", "other", secretmanager.WithPath("/other"))

		// Action
		got := listSecrets(t, tn.Admin, proj, "/deep1", true)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing recursively: %s", got.body)
		require.Equal(t, map[string]string{"DEEP1": "deep1", "DEEP2": "deep2"}, got.values)
	})

	t.Run("should list recursively only the granted subfolder for a grant-only user", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/a/b")
		secretmanager.CreateSecret(t, proj, "dev", "IN_A", "secret-in-a", secretmanager.WithPath("/a"))
		secretmanager.CreateSecret(t, proj, "dev", "IN_B", "secret-in-b", secretmanager.WithPath("/a/b"))
		grantOnly := proj.NewUser(t, fixture.WithPrincipalName("granted"), fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, grantOnly, at("/a/b"), secretmanager.FolderRead)

		// Action
		got := listSecrets(t, grantOnly, proj, "/a", true)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing recursively: %s", got.body)
		require.Equal(t, map[string]string{"IN_B": "secret-in-b"}, got.values)
		require.NotContains(t, string(got.body), "secret-in-a")
	})

	t.Run("should refuse a recursive list for a user with no access", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/a/b")
		secretmanager.CreateSecret(t, proj, "dev", "IN_B", "secret-in-b", secretmanager.WithPath("/a/b"))
		noAccess := proj.NewUser(t, fixture.WithPrincipalName("outsider"), fixture.WithRoles("no-access"))

		// Action
		got := listSecrets(t, noAccess, proj, "/a", true)

		// Assert
		require.Equalf(t, http.StatusForbidden, got.status, "listing recursively: %s", got.body)
		require.NotContains(t, string(got.body), "secret-in-b")
	})
}
