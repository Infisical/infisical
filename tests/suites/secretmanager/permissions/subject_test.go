package permissions_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// The built-in viewer reads every subject below and writes none of them, so each
// subtest is a write the viewer is refused.
func TestViewer_OtherSubjects(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	viewerOf := func(t *testing.T) (*fixture.Project, *harness.Principal) {
		t.Helper()
		proj := newProject(t, h.NewTenant(t))
		return proj, proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
	}

	t.Run("should refuse a viewer creating a folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)

		// Action
		res, err := viewer.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "app",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating a folder: %s", res.Body)
		folders, err := proj.Tenant().Admin.API.ListSecretFoldersWithResponse(t.Context(),
			&api.ListSecretFoldersParams{ProjectId: proj.ID, Environment: "dev", Path: "/"})
		require.NoError(t, err)
		require.NotNil(t, folders.JSON200)
		require.Empty(t, folders.JSON200.Folders)
	})

	t.Run("should refuse a viewer creating an import", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)
		body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Import.Environment, body.Import.Path = "prod", "/"

		// Action
		res, err := viewer.API.CreateSecretImportWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating an import: %s", res.Body)
		imports, err := proj.Tenant().Admin.API.ListSecretImportsWithResponse(t.Context(),
			&api.ListSecretImportsParams{ProjectId: proj.ID, Environment: "dev"})
		require.NoError(t, err)
		require.NotNil(t, imports.JSON200)
		require.Empty(t, imports.JSON200.SecretImports)
	})

	t.Run("should refuse a viewer creating a tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)

		// Action
		res, err := viewer.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
			api.CreateSecretTagJSONRequestBody{Slug: "viewer-tag", Color: "#2563eb"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating a tag: %s", res.Body)
		tags, err := proj.Tenant().Admin.API.ListSecretTagsWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNil(t, tags.JSON200)
		require.Empty(t, tags.JSON200.Tags)
	})

	t.Run("should refuse a viewer creating an environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)

		// Action
		res, err := viewer.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: "qa"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating an environment: %s", res.Body)
		got, err := proj.Tenant().Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		slugs := []string{}
		for _, env := range got.JSON200.Project.Environments {
			slugs = append(slugs, env.Slug)
		}
		require.ElementsMatch(t, proj.Environments, slugs)
	})

	t.Run("should refuse a viewer creating a webhook", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)

		// Action
		res, err := viewer.API.CreateWebhookWithResponse(t.Context(), api.CreateWebhookJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", WebhookUrl: "https://hooks.example.com/infisical",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating a webhook: %s", res.Body)
		hooks, err := proj.Tenant().Admin.API.ListWebhooksWithResponse(t.Context(), &api.ListWebhooksParams{ProjectId: proj.ID})
		require.NoError(t, err)
		require.NotNil(t, hooks.JSON200)
		require.Empty(t, hooks.JSON200.Webhooks)
	})

	t.Run("should refuse a viewer rolling back a commit", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "API_KEY", "second")
		first := oldestCommit(t, proj)

		// Action
		res, err := viewer.API.RollbackFolderCommitWithResponse(t.Context(), first.CommitId, api.RollbackFolderCommitJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", FolderId: first.FolderId,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "rolling back: %s", res.Body)
		require.Equal(t, map[string]string{"API_KEY": "second"}, secretsAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a viewer leasing a dynamic secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)
		newTOTPDynamicSecret(t, proj, "otp")

		// Action
		res, err := viewer.API.CreateDynamicSecretLeaseWithResponse(t.Context(), api.CreateDynamicSecretLeaseJSONRequestBody{
			ProjectSlug: proj.Slug, EnvironmentSlug: "dev", DynamicSecretName: "otp",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "leasing: %s", res.Body)
		leases, err := proj.Tenant().Admin.API.ListDynamicSecretLeasesWithResponse(t.Context(), "otp",
			&api.ListDynamicSecretLeasesParams{ProjectSlug: proj.Slug, EnvironmentSlug: "dev"})
		require.NoError(t, err)
		require.NotNilf(t, leases.JSON200, "listing leases returned %d: %s", leases.StatusCode(), leases.Body)
		require.Empty(t, leases.JSON200.Leases)
	})

	t.Run("should refuse a viewer triggering a secret sync", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)
		syncID := newRepoSync(t, proj)

		// Action
		res, err := viewer.API.SyncGitHubSecretSyncWithResponse(t.Context(), syncID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "triggering the sync: %s", res.Body)
		got, err := proj.Tenant().Admin.API.GetGitHubSecretSyncWithResponse(t.Context(), syncID)
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		require.Nil(t, got.JSON200.SecretSync.LastSyncJobId)
	})

	t.Run("should refuse a viewer creating a secret rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, viewer := viewerOf(t)
		body, err := json.Marshal(map[string]any{
			"name":             "rotation",
			"projectId":        proj.ID,
			"environment":      "dev",
			"secretPath":       "/",
			"connectionId":     uuid.NewString(),
			"rotationInterval": 30,
			"parameters":       map[string]any{"username1": "app_a", "username2": "app_b"},
			"secretsMapping":   map[string]any{"username": "DB_USER", "password": "DB_PASS"},
		})
		require.NoError(t, err)

		// Action
		res, err := viewer.API.CreatePostgreSQLCredentialsRotationWithBodyWithResponse(t.Context(),
			"application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "creating a rotation: %s", res.Body)
		require.Empty(t, secretsAt(t, proj, "dev", "/"))
	})
}

type commit struct {
	CommitId string
	FolderId string
}

func oldestCommit(t *testing.T, proj *fixture.Project) commit {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListFolderCommitsWithResponse(t.Context(), &api.ListFolderCommitsParams{
		ProjectId: proj.ID, Environment: "dev", Path: new("/"),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing commits returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.NotEmpty(t, res.JSON200.Commits)
	oldest := res.JSON200.Commits[len(res.JSON200.Commits)-1]
	return commit{CommitId: oldest.Id, FolderId: oldest.FolderId}
}

func newTOTPDynamicSecret(t *testing.T, proj *fixture.Project, name string) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"projectSlug":     proj.Slug,
		"environmentSlug": "dev",
		"name":            name,
		"defaultTTL":      "1h",
		"provider": map[string]any{
			"type":   "totp",
			"inputs": map[string]any{"configType": "manual", "secret": "JBSWY3DPEHPK3PXP"},
		},
	})
	require.NoError(t, err)
	res, err := proj.Tenant().Admin.API.CreateDynamicSecretWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating dynamic secret %s: %s", name, apierr.Body(res.Body))
}

// newRepoSync creates a sync with auto-sync off, so nothing runs until it is triggered.
func newRepoSync(t *testing.T, proj *fixture.Project) uuid.UUID {
	t.Helper()
	conn := fixture.NewAppConnection(t, proj.Tenant(), fixture.GitHubPATAppConnection)
	var dest api.CreateGitHubSecretSyncJSONBody_DestinationConfig
	require.NoError(t, dest.FromCreateGitHubSecretSyncJSONBodyDestinationConfig1(
		api.CreateGitHubSecretSyncJSONBodyDestinationConfig1{Owner: "acme", Repo: "app", Scope: "repository"}))
	body := api.CreateGitHubSecretSyncJSONRequestBody{
		Name:              "sync-" + uuid.NewString()[:8],
		ProjectId:         proj.ID,
		ConnectionId:      conn.ID,
		Environment:       "dev",
		SecretPath:        "/",
		DestinationConfig: dest,
		IsAutoSyncEnabled: new(false),
	}
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	res, err := proj.Tenant().Admin.API.CreateGitHubSecretSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.SecretSync.Id
}
