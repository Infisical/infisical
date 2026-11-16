package folderaccess_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestFolderAccess_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	withoutFolderRBAC := license.Enterprise().Without(license.SecretsFolderRBAC)
	const planMessage = "Failed to apply folder access to subfolders due to plan restriction. Upgrade your Infisical plan to apply folder access to subfolders."

	t.Run("should grant folder access when the plan does not include folder rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutFolderRBAC))
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		res := grantAs(t, tn.Admin, proj, pr, at("/app"), secretmanager.FolderManage, nil)

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "granting: %s", res.body)
		require.Len(t, grantsOf(t, proj, pr), 1)
	})

	t.Run("should refuse folder access that applies to subfolders when the plan does not include folder rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutFolderRBAC))
		proj := newProject(t, tn)
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		res := grantAs(t, tn.Admin, proj, pr, at("/"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.status, "granting: %s", res.body)
		require.Equal(t, planMessage, res.message)
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, grantsOf(t, proj, pr))
	})

	t.Run("should refuse editing folder access that applies to subfolders after a downgrade unless the edit turns it off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		created := grantAs(t, tn.Admin, proj, pr, at("/"), secretmanager.FolderRead, map[string]any{"isPermissionRecursive": true})
		require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)
		tn.SetPlan(t, withoutFolderRBAC)

		// Action
		roleChange := updateGrant(t, tn.Admin, proj, pr, at("/"), map[string]any{"permission": string(secretmanager.FolderEdit)})
		recursionOff := updateGrant(t, tn.Admin, proj, pr, at("/"), map[string]any{"isPermissionRecursive": false})

		// Assert
		require.Equalf(t, http.StatusBadRequest, roleChange.status, "changing the role: %s", roleChange.body)
		require.Equal(t, planMessage, roleChange.message)
		require.Equalf(t, http.StatusOK, recursionOff.status, "turning subfolders off: %s", recursionOff.body)
		grants := grantsOf(t, proj, pr)
		require.Len(t, grants, 1)
		require.Equal(t, string(secretmanager.FolderRead), grants[0].Permission)
		require.False(t, grants[0].IsPermissionRecursive)
	})

	t.Run("should keep an existing grant working after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext", secretmanager.WithPath("/app"))
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/app"), secretmanager.FolderRead)
		tn.SetPlan(t, withoutFolderRBAC)

		// Action
		got := listSecrets(t, pr, proj, "/app", false)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing after the downgrade: %s", got.body)
		require.Equal(t, map[string]string{"API_KEY": "plaintext"}, got.values)
	})

	t.Run("should keep listing and revoking grants after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/app"), secretmanager.FolderRead)
		tn.SetPlan(t, withoutFolderRBAC)

		// Action
		listed := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{})
		grantsStatus, grantsBody := listGrantsAs(t, tn.Admin, proj, pr)
		revoked := revokeGrant(t, tn.Admin, proj, pr, at("/app"))

		// Assert
		require.Equalf(t, http.StatusOK, listed.status, "listing folder access: %s", listed.body)
		require.NotNil(t, listed.with[pr.ID.String()].Grant)
		require.Equalf(t, http.StatusOK, grantsStatus, "listing grants: %s", grantsBody)
		require.Contains(t, string(grantsBody), "/app")
		require.Equalf(t, http.StatusOK, revoked.status, "revoking: %s", revoked.body)
		require.Empty(t, grantsOf(t, proj, pr))
	})
}
