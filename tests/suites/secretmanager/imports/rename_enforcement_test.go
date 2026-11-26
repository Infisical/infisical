package imports_test

import (
	"net/http"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
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

	t.Run("should never let a direct import created during the rename end up in a folder that requires approval", func(t *testing.T) {
		t.Parallel()

		tn := h.NewTenant(t)
		for range raceAttempts {
			// Setup
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
			secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
			legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
			policyID := createBypassPolicy(t, proj, "prod", "/gov", true)

			// Action
			renamed, imported := raceRename(t, identity, proj, legacyID, func() (int, error) {
				body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "prod", Path: new("/legacy")}
				body.Import.Environment = stagingApp.Env
				body.Import.Path = stagingApp.Path
				res, err := identity.API.CreateSecretImportWithResponse(t.Context(), body)
				if err != nil {
					return 0, err
				}
				return res.StatusCode(), nil
			})

			// Assert
			requireOneRaceWinner(t, proj, policyID, renamed, imported, "import")
		}
	})

	t.Run("should never let an import repointed to this project during the rename end up in a folder that requires approval", func(t *testing.T) {
		t.Parallel()

		tn := h.NewTenant(t)
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		for range raceAttempts {
			// Setup
			source := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
			secretmanager.GrantFolder(t, source, proj, secretmanager.Location{Env: "dev", Path: "/"})
			secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
			legacyID := secretmanager.CreateFolder(t, proj, "prod", "/legacy")
			crossImport := secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "dev", Path: "/"},
				secretmanager.FromProject(source), secretmanager.IntoPath("/legacy"))
			policyID := createBypassPolicy(t, proj, "prod", "/gov", true)

			// Action
			renamed, repointed := raceRename(t, identity, proj, legacyID, func() (int, error) {
				body := api.UpdateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "prod", Path: new("/legacy")}
				body.Import.Environment = &stagingApp.Env
				body.Import.Path = &stagingApp.Path
				res, err := identity.API.UpdateSecretImportWithResponse(t.Context(), crossImport, body)
				if err != nil {
					return 0, err
				}
				return res.StatusCode(), nil
			})

			// Assert
			requireOneRaceWinner(t, proj, policyID, renamed, repointed, "repoint")
		}
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
// the tenant admin as its only approver, and returns its id.
func createBypassPolicy(t *testing.T, proj *fixture.Project, env, secretPath string, enforce bool) uuid.UUID {
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
	return res.JSON200.Approval.Id
}

// raceAttempts is how many times each race runs. one run cannot force the interleaving, but the property checked has
// to hold on every run, so a regression fails most of them.
const raceAttempts = 5

// raceRename renames the folder to /gov while other runs, starting both together, and returns both status codes. the
// racing calls report errors instead of failing the test, since require cannot stop a test from another goroutine.
func raceRename(t *testing.T, actor *harness.Principal, proj *fixture.Project, folderID string, other func() (int, error)) (int, int) {
	t.Helper()
	var renamed, otherStatus int
	var renameErr, otherErr error
	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Go(func() {
		<-start
		res, err := actor.API.UpdateSecretFolderWithResponse(t.Context(), folderID, api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "prod", Path: new("/"), Name: "gov",
		})
		renameErr = err
		if err == nil {
			renamed = res.StatusCode()
		}
	})
	wg.Go(func() {
		<-start
		otherStatus, otherErr = other()
	})
	close(start)
	wg.Wait()
	require.NoError(t, renameErr)
	require.NoError(t, otherErr)
	return renamed, otherStatus
}

// requireOneRaceWinner checks a race between renaming /legacy to /gov and a request that puts a direct import in
// /legacy. exactly one of them may win. when the rename wins, the other request is refused by the policy (400) or, if
// it looked /legacy up after the rename, finds no folder (404). when the import wins, the rename is refused (400). any
// other status, a 500 included, fails, and either way the policy on /gov must govern no direct import.
func requireOneRaceWinner(t *testing.T, proj *fixture.Project, policyID uuid.UUID, renamed, other int, otherName string) {
	t.Helper()
	switch {
	case renamed == http.StatusOK:
		require.Containsf(t, []int{http.StatusBadRequest, http.StatusNotFound}, other,
			"the rename succeeded and the %s returned %d", otherName, other)
	case other == http.StatusOK:
		require.Equalf(t, http.StatusBadRequest, renamed, "the %s succeeded and the rename returned %d", otherName, renamed)
	default:
		require.Failf(t, "neither request succeeded", "the rename returned %d and the %s returned %d", renamed, otherName, other)
	}
	require.Empty(t, listPolicyImports(t, proj, policyID, api.ListSecretApprovalPolicyImportsParamsIsReplicationFalse),
		"a direct import ended up in a folder the policy on /gov governs")
}

func renameFolder(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, parentPath, folderID, name string) *api.UpdateSecretFolderResponse {
	t.Helper()
	res, err := actor.API.UpdateSecretFolderWithResponse(t.Context(), folderID, api.UpdateSecretFolderJSONRequestBody{
		ProjectId: proj.ID, Environment: env, Path: &parentPath, Name: name,
	})
	require.NoError(t, err)
	return res
}
