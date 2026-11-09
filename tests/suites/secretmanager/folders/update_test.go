package folders_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolder_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a rename onto a sibling's name and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		api1 := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/api"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/web")

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), api1.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/app"), Name: "web",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Folder with specified name already exists", res.JSON400.Message)
		require.ElementsMatch(t, []string{"api", "web"}, folderNames(t, proj, "dev", "/app"))
	})

	t.Run("should serve secrets at the new path and not at the old one after a rename", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "/service", res.JSON200.Folder.Path)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY", secretmanager.WithPath("/service")).Value)
		require.Nil(t, secretKeys(t, proj, "dev", "/app"), "the old path still answers")
	})

	t.Run("should refuse a rename when a policy protects a secret in a subfolder and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app/api"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app/api"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`You cannot rename the selected folder because it contains one or more secrets that are protected by the change policy %q at folder path "/app/api". Please remove the secrets at folder path "/app/api" and try again.`, guard),
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app/api"))
	})

	t.Run("should refuse a rename when a policy protects a secret in the folder and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`You cannot rename the selected folder because it contains one or more secrets that are protected by the change policy %q at folder path "/app". Please remove the secrets at folder path "/app" and try again.`, guard),
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app"))
	})

	t.Run("should rename a folder when a policy covers it and the tree has no secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "/service", res.JSON200.Folder.Path)
		require.Equal(t, []string{"service"}, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should save a description when a policy protects a secret and leave the name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "app", Description: new("noted"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "app", res.JSON200.Folder.Name)
		got, err := tn.Admin.API.GetSecretFolderByIdWithResponse(t.Context(), folderID.String())
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading returned %d: %s", got.StatusCode(), got.Body)
		require.Equal(t, "app", got.JSON200.Folder.Name)
		require.NotNil(t, got.JSON200.Folder.Description)
		require.Equal(t, "noted", *got.JSON200.Folder.Description)
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app"))
	})

	t.Run("should refuse a batch rename when a policy protects one folder's secrets and keep both names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		appID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		webID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/web"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app"}, reviewer)
		batch := api.UpdateSecretFoldersBatchJSONRequestBody{ProjectId: proj.ID}
		batch.Folders = slices.Grow(batch.Folders, 2)[:2]
		batch.Folders[0].Id, batch.Folders[0].Environment, batch.Folders[0].Name, batch.Folders[0].Path =
			appID.String(), "dev", "renamed-app", new("/")
		batch.Folders[1].Id, batch.Folders[1].Environment, batch.Folders[1].Name, batch.Folders[1].Path =
			webID.String(), "dev", "renamed-web", new("/")

		// Action
		res, err := tn.Admin.API.UpdateSecretFoldersBatchWithResponse(t.Context(), batch)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.ElementsMatch(t, []string{"app", "web"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app"))
	})

	t.Run("should refuse a rename when a policy protects a secret import in a subfolder and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/"}, secretmanager.IntoPath("/app/api"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app/api"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`You cannot rename the selected folder because it contains one or more secret imports that are protected by the change policy %q at folder path "/app/api". Please remove the secret imports at folder path "/app/api" and try again.`, guard),
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		imports, err := tn.Admin.API.ListSecretImportsWithResponse(t.Context(), &api.ListSecretImportsParams{
			ProjectId: proj.ID, Environment: "dev", Path: new("/app/api"),
		})
		require.NoError(t, err)
		require.NotNilf(t, imports.JSON200, "listing imports of dev:/app/api returned %d: %s", imports.StatusCode(), imports.Body)
		require.Len(t, imports.JSON200.SecretImports, 1)
	})

	t.Run("should refuse a rename that would move secrets under a protected path and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/staging"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/staging"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/prod"}, reviewer)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "prod",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`You cannot rename the selected folder because its secrets would move to folder path "/prod", which is protected by the change policy %q. Choose a different name and try again.`, guard),
			res.JSON400.Message)
		require.Equal(t, []string{"staging"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/staging"))
	})

	t.Run("should let a machine identity rename a protected folder when the policy bypasses identities", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		var approver api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
		require.NoError(t, approver.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
			Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
			Id:   new(reviewer.ID.String()),
		}))
		policy, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:                  proj.ID,
			Name:                       new("identity-bypass"),
			Environment:                new("dev"),
			SecretPath:                 "/app",
			Approvals:                  new(float32(1)),
			Approvers:                  []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{approver},
			BypassForMachineIdentities: new(true),
		})
		require.NoError(t, err)
		require.NotNilf(t, policy.JSON200, "creating the policy returned %d: %s", policy.StatusCode(), policy.Body)

		// Action
		res, err := identity.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "/service", res.JSON200.Folder.Path)
		require.Equal(t, []string{"service"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/service"))
	})
}
