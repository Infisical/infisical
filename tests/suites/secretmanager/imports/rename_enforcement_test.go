package imports_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestImportReplicationEnforcement_FolderRename(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an identity the policy bypasses renaming a direct import into a folder that requires approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))
		require.Contains(t, apierr.Message(res.Body), "requires approval for imported secrets")
		require.Len(t, listImports(t, proj, "prod", "/legacy"), 1)
	})

	t.Run("should refuse the rename when the direct import sits in a subfolder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateFolder(t, proj, "prod", "/legacy/api")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy/api"))
		createBypassPolicy(t, proj, "prod", "/gov/**", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))
		require.Len(t, listImports(t, proj, "prod", "/legacy/api"), 1)
	})

	t.Run("should refuse the same rename through the batch endpoint", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		var body api.UpdateSecretFoldersBatchJSONRequestBody
		body.ProjectId = proj.ID
		body.Folders = append(body.Folders, struct {
			Description *string `json:"description,omitempty"`
			Environment string  `json:"environment"`
			Id          string  `json:"id"`
			Name        string  `json:"name"`
			Path        *string `json:"path,omitempty"`
		}{Environment: "prod", Id: legacyID, Name: "gov", Path: new("/")})
		res, err := identity.API.UpdateSecretFoldersBatchWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))
		require.Len(t, listImports(t, proj, "prod", "/legacy"), 1)
	})

	t.Run("should let an identity the policy bypasses rename a replicated import into a folder that requires approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"), secretmanager.Replicated())
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "/gov", res.JSON200.Folder.Path)
	})

	t.Run("should let an identity the policy bypasses rename a cross-project import into a folder that requires approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		secretmanager.GrantFolder(t, source, proj, secretmanager.Location{Env: "dev", Path: "/"})
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "dev", Path: "/"},
			secretmanager.FromProject(source), secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "/gov", res.JSON200.Folder.Path)
	})

	t.Run("should let an identity the policy bypasses rename a folder into one whose policy does not require approval for imports", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/gov", false)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "/gov", res.JSON200.Folder.Path)
	})

	t.Run("should let an identity the policy bypasses rename a direct import that predates the policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/**", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "renamed")

		// Assert
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "/renamed", res.JSON200.Folder.Path)
	})

	t.Run("should refuse an identity the policy bypasses moving a direct import that predates one policy into another policy's folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/legacy", true)
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))
		require.Len(t, listImports(t, proj, "prod", "/legacy"), 1)
	})

	t.Run("should follow the more specific policy that does not require approval for imports over a glob that does", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/legacy", false)
		createBypassPolicy(t, proj, "prod", "/gov", false)
		createBypassPolicy(t, proj, "prod", "/**", true)

		// Action
		res := renameFolder(t, identity, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "/gov", res.JSON200.Folder.Path)
	})

	t.Run("should keep refusing a user the policy applies to with the existing protected path error", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/legacy"))
		createBypassPolicy(t, proj, "prod", "/gov", true)

		// Action
		res := renameFolder(t, tn.Admin, proj, "prod", "/", legacyID, "gov")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))
		require.Contains(t, apierr.Message(res.Body), "which is protected by the change policy")
	})
}

// createBypassPolicy puts a secret change policy that machine identities bypass on env's folder at secretPath, with
// the tenant admin as its only approver.
func createBypassPolicy(t *testing.T, proj *fixture.Project, env, secretPath string, enforce bool) {
	t.Helper()
	var item api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
	require.NoError(t, item.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
		Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
		Id:   new(proj.Tenant().Admin.ID.String()),
	}))
	res, err := proj.Tenant().Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
		ProjectId:                  proj.ID,
		Environment:                &env,
		SecretPath:                 secretPath,
		Approvals:                  new(float32(1)),
		Approvers:                  []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{item},
		EnforceOnSecretImports:     &enforce,
		BypassForMachineIdentities: new(true),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func renameFolder(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, parentPath, folderID, name string) *api.UpdateSecretFolderResponse {
	t.Helper()
	res, err := actor.API.UpdateSecretFolderWithResponse(t.Context(), folderID, api.UpdateSecretFolderJSONRequestBody{
		ProjectId: proj.ID, Environment: env, Path: &parentPath, Name: name,
	})
	require.NoError(t, err)
	return res
}
