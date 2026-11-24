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
	const planMessage = "Failed to access folder access controls due to plan restriction. Upgrade your Infisical plan."

	t.Run("should refuse a grant create when the plan does not include folder rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutFolderRBAC))
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		res := grantAs(t, tn.Admin, proj, pr, at("/app"), secretmanager.FolderRead, nil)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.status, "granting: %s", res.body)
		require.Equal(t, planMessage, res.message)
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, grantsOf(t, proj, pr))
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

	t.Run("should refuse listing and revoking grants after a downgrade, naming the plan (license gate on a read path)", func(t *testing.T) {
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
		require.Equal(t, http.StatusBadRequest, listed.status)
		require.Contains(t, string(listed.body), planMessage)
		require.Equal(t, http.StatusBadRequest, grantsStatus)
		require.Contains(t, string(grantsBody), planMessage)
		require.Equal(t, http.StatusBadRequest, revoked.status)
		require.Equal(t, planMessage, revoked.message)
		tn.SetPlan(t, license.Enterprise())
		require.Len(t, grantsOf(t, proj, pr), 1)
	})
}
