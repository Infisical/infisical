package folders_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolder_Move(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should move a subtree with secrets at every level within an environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/src"))
		secretmanager.CreateFolder(t, proj, "dev", "/src/level1/level2")
		secretmanager.CreateFolder(t, proj, "dev", "/dest")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_SECRET", "root", secretmanager.WithPath("/src"))
		secretmanager.CreateSecret(t, proj, "dev", "L1_SECRET", "l1", secretmanager.WithPath("/src/level1"))
		secretmanager.CreateSecret(t, proj, "dev", "L2_SECRET", "l2", secretmanager.WithPath("/src/level1/level2"))

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/dest")

		// Assert
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "l2", secretmanager.GetSecret(t, proj, "dev", "L2_SECRET", secretmanager.WithPath("/dest/src/level1/level2")).Value)
		require.Equal(t, []string{"L1_SECRET"}, secretKeys(t, proj, "dev", "/dest/src/level1"))
		require.Equal(t, []string{"ROOT_SECRET"}, secretKeys(t, proj, "dev", "/dest/src"))
		require.Equal(t, []string{"dest"}, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should move a subtree to another environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "CROSS_SECRET", "value", secretmanager.WithPath("/app"))

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "staging", "/")

		// Assert
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "dev", res.JSON200.SourceEnvironment)
		require.Equal(t, "/app", res.JSON200.SourcePath)
		require.Equal(t, "staging", res.JSON200.DestinationEnvironment)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "staging", "CROSS_SECRET", secretmanager.WithPath("/app")).Value)
		require.Empty(t, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should refuse a move when the destination holds a folder of that name and keep the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/dest/app")

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/dest")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "A folder named 'app' already exists at path '/dest' in environment 'dev'", res.JSON400.Message)
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app"))
		require.Empty(t, secretKeys(t, proj, "dev", "/dest/app"))
	})

	t.Run("should refuse a move when a policy guards a folder in the source subtree and move nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/src"))
		secretmanager.CreateFolder(t, proj, "dev", "/src/protected")
		secretmanager.CreateFolder(t, proj, "dev", "/dest")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_SECRET", "root", secretmanager.WithPath("/src"))
		secretmanager.CreateSecret(t, proj, "dev", "PROTECTED_SECRET", "p", secretmanager.WithPath("/src/protected"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/src/protected"}, reviewer)

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/dest")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf("Cannot move folder 'src'. The folder at path '/src/protected' is protected by the secret approval policy '%s'. Folders governed by a secret approval policy cannot be moved. If you need to move this folder, please disable the secret approval policy for the path '/src/protected'", guard),
			res.JSON400.Message)
		require.Equal(t, []string{"ROOT_SECRET"}, secretKeys(t, proj, "dev", "/src"))
		require.Equal(t, []string{"PROTECTED_SECRET"}, secretKeys(t, proj, "dev", "/src/protected"))
		require.Empty(t, folderNames(t, proj, "dev", "/dest"))
	})

	t.Run("should refuse a move when a policy guards the destination and move nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/guarded")
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/guarded/app"}, reviewer)

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/guarded")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf("Cannot move folder 'app'. The destination path '/guarded/app' is protected by the secret approval policy '%s'. Folders cannot be moved into a path governed by a secret approval policy. If you need to move this folder here, please disable the secret approval policy for the path '/guarded/app'", guard),
			res.JSON400.Message)
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app"))
		require.Empty(t, folderNames(t, proj, "dev", "/guarded"))
	})

	t.Run("should refuse moving the root folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		child, err := tn.Admin.API.GetSecretFolderByIdWithResponse(t.Context(), uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app")).String())
		require.NoError(t, err)
		require.NotNilf(t, child.JSON200, "reading the folder returned %d: %s", child.StatusCode(), apierr.Body(child.Body))
		require.NotNil(t, child.JSON200.Folder.ParentId)
		root := *child.JSON200.Folder.ParentId

		// Action
		res := moveFolder(t, tn.Admin, proj, root, "staging", "/")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cannot move the root folder", res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should refuse moving a folder into its own subfolder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/app/api")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cannot move a folder into itself or one of its own subfolders", res.JSON400.Message)
		require.Equal(t, []string{"api"}, folderNames(t, proj, "dev", "/app"))
	})

	t.Run("should refuse moving a folder to where it already is", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/api"))

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "dev", "/app")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Folder 'api' is already located at path '/app'", res.JSON400.Message)
		require.Equal(t, []string{"api"}, folderNames(t, proj, "dev", "/app"))
	})

	t.Run("should refuse moving a folder that holds an import, naming it to an actor who can read imports", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"}, secretmanager.IntoPath("/app"))

		// Action
		res := moveFolder(t, tn.Admin, proj, src, "staging", "/")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Cannot move folder 'app'. It contains a secret import at path '/'. Only folders that contain exclusively static secrets can be moved.",
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Empty(t, folderNames(t, proj, "staging", "/"))
	})

	t.Run("should refuse moving a folder that holds an import without naming it to an actor who cannot read imports", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "folder-mover", fixture.Permission{Subject: "secret-folders", Action: []string{"create", "delete"}})
		mover := proj.NewUser(t, fixture.WithPrincipalName("mover"), fixture.WithRoles("folder-mover"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"}, secretmanager.IntoPath("/app"))

		// Action
		res := moveFolder(t, mover, proj, src, "staging", "/")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Cannot move folder 'app'. It contains resources that cannot be moved. Only folders that contain exclusively static secrets can be moved.",
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Empty(t, folderNames(t, proj, "staging", "/"))
	})

	t.Run("should remove another project's grant on the moved folder, so its reference to the new path stays literal", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Today's behaviour: the move recreates the folders with new ids, and the
			cascade on project_folder_grants.sourceFolderId deletes the grant.`)

		// Setup
		tn := h.NewTenant(t)
		source := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		target := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		src := uuid.MustParse(secretmanager.CreateFolder(t, source, "dev", "/app"))
		secretmanager.CreateFolder(t, source, "dev", "/moved")
		secretmanager.CreateSecret(t, source, "dev", "SHARED", "from-source", secretmanager.WithPath("/app"))
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		secretmanager.GrantFolder(t, source, target, secretmanager.Location{Env: "dev", Path: "/app"})
		before := fmt.Sprintf("${@%s.dev.app.SHARED}", source.Slug)
		secretmanager.CreateSecret(t, target, "dev", "BEFORE", before)
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "BEFORE").Value)

		// Action
		res := moveFolder(t, tn.Admin, source, src, "dev", "/moved")

		// Assert
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), res.Body)
		grants, err := tn.Admin.API.ListProjectFolderGrantsWithResponse(t.Context(),
			&api.ListProjectFolderGrantsParams{SourceProjectId: source.ID})
		require.NoError(t, err)
		require.NotNilf(t, grants.JSON200, "listing grants returned %d: %s", grants.StatusCode(), apierr.Body(grants.Body))
		require.Empty(t, grants.JSON200.Grants)
		after := fmt.Sprintf("${@%s.dev.moved.app.SHARED}", source.Slug)
		secretmanager.CreateSecret(t, target, "dev", "AFTER", after)
		require.Equal(t, after, secretmanager.GetSecret(t, target, "dev", "AFTER").Value)
	})
}
