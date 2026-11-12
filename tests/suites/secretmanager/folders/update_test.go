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
	"github.com/Infisical/infisical/tests/internal/spec"
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

	t.Run("should refuse a batch that renames a folder together with its subfolder and keep both names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		appID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		apiID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/api"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app/api"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/service/web"}, reviewer)
		batch := api.UpdateSecretFoldersBatchJSONRequestBody{ProjectId: proj.ID}
		batch.Folders = slices.Grow(batch.Folders, 2)[:2]
		batch.Folders[0].Id, batch.Folders[0].Environment, batch.Folders[0].Name, batch.Folders[0].Path =
			appID.String(), "dev", "service", new("/")
		batch.Folders[1].Id, batch.Folders[1].Environment, batch.Folders[1].Name, batch.Folders[1].Path =
			apiID.String(), "dev", "web", new("/app")
		spec.Why(t, `Each rename alone keeps API_KEY outside the policy on /service/web; together they would
			move it there without approval.`)

		// Action
		res, err := tn.Admin.API.UpdateSecretFoldersBatchWithResponse(t.Context(), batch)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			`Folder "/app/api" overlaps with folder "/app" in environment "dev". A batch can rename each folder only once and cannot rename a folder together with its subfolders. Rename them in separate requests.`,
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app/api"))
	})

	t.Run("should save descriptions for a folder and its subfolder in one batch", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		appID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		apiID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/api"))
		batch := api.UpdateSecretFoldersBatchJSONRequestBody{ProjectId: proj.ID}
		batch.Folders = slices.Grow(batch.Folders, 2)[:2]
		batch.Folders[0].Id, batch.Folders[0].Environment, batch.Folders[0].Name, batch.Folders[0].Path, batch.Folders[0].Description =
			appID.String(), "dev", "app", new("/"), new("parent")
		batch.Folders[1].Id, batch.Folders[1].Environment, batch.Folders[1].Name, batch.Folders[1].Path, batch.Folders[1].Description =
			apiID.String(), "dev", "api", new("/app"), new("child")

		// Action
		res, err := tn.Admin.API.UpdateSecretFoldersBatchWithResponse(t.Context(), batch)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch update returned %d: %s", res.StatusCode(), res.Body)
		for id, want := range map[uuid.UUID]string{appID: "parent", apiID: "child"} {
			got, err := tn.Admin.API.GetSecretFolderByIdWithResponse(t.Context(), id.String())
			require.NoError(t, err)
			require.NotNilf(t, got.JSON200, "reading returned %d: %s", got.StatusCode(), got.Body)
			require.NotNil(t, got.JSON200.Folder.Description)
			require.Equal(t, want, *got.JSON200.Folder.Description)
		}
	})

	t.Run("should refuse renaming a folder whose subfolder has an open change request and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app/api"}, reviewer)
		held, err := committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/app/api"), SecretValue: "value",
		})
		require.NoError(t, err)
		require.Containsf(t, string(held.Body), `"approval"`, "the write was not held: %s", held.Body)
		spec.Why(t, `The request keeps the policy it was opened under, so after a rename it would merge into a
			path whose own policy never reviewed it.`)

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			`You cannot rename the selected folder because it has open change requests at folder path "/app/api". Merge or close the change requests and try again.`,
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should refuse renaming a folder with an open change request without naming it to an actor who cannot read change requests", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		proj.NewRole(t, "folder-editor", fixture.Permission{Subject: "secret-folders", Action: []string{"edit"}})
		editor := proj.NewUser(t, fixture.WithPrincipalName("editor"), fixture.WithRoles("folder-editor"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app/api"}, reviewer)
		held, err := committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/app/api"), SecretValue: "value",
		})
		require.NoError(t, err)
		require.Containsf(t, string(held.Body), `"approval"`, "the write was not held: %s", held.Body)

		// Action
		res, err := editor.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			`You cannot rename the selected folder because it contains resources that are protected by a change policy. Contact a project admin and try again.`,
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
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
