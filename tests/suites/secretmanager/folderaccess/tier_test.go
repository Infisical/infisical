package folderaccess_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolderAccess_Tiers(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// holder is a project identity with no base access and one tier on dev:/app, which
	// holds API_KEY.
	holder := func(t *testing.T, tier secretmanager.FolderTier) (*fixture.Project, *harness.Principal) {
		t.Helper()
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext", secretmanager.WithPath("/app"))
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/app"), tier)
		return proj, pr
	}

	t.Run("should let a list holder see names but not values or write", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, pr := holder(t, secretmanager.FolderList)

		// Action
		withValues := listSecrets(t, pr, proj, "/app", false)
		namesOnly, err := pr.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"), SecretPath: new("/app"),
			ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueFalse),
		})
		created := createSecret(t, pr, proj, "/app", "NEW_KEY", "v")

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, withValues.status, "listing with values: %s", withValues.body)
		require.NotNilf(t, namesOnly.JSON200, "listing names returned %d: %s", namesOnly.StatusCode(), namesOnly.Body)
		require.Len(t, namesOnly.JSON200.Secrets, 1)
		require.Equal(t, "API_KEY", namesOnly.JSON200.Secrets[0].SecretKey)
		require.True(t, namesOnly.JSON200.Secrets[0].SecretValueHidden)
		require.NotContains(t, string(namesOnly.Body), "plaintext")
		require.Equal(t, http.StatusForbidden, created)
		require.Equal(t, map[string]string{"API_KEY": "plaintext"}, secretsAt(t, proj, "/app"))
	})

	t.Run("should let a read holder see values but not write", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, pr := holder(t, secretmanager.FolderRead)

		// Action
		got := listSecrets(t, pr, proj, "/app", false)
		created := createSecret(t, pr, proj, "/app", "NEW_KEY", "v")

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing: %s", got.body)
		require.Equal(t, map[string]string{"API_KEY": "plaintext"}, got.values)
		require.Equal(t, http.StatusForbidden, created)
		require.Equal(t, map[string]string{"API_KEY": "plaintext"}, secretsAt(t, proj, "/app"))
	})

	t.Run("should let an edit holder write secrets in the folder but not rotations", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, pr := holder(t, secretmanager.FolderEdit)

		// Action
		inside := createSecret(t, pr, proj, "/app", "NEW_KEY", "v")
		outside := createSecret(t, pr, proj, "/", "ROOT_KEY", "v")
		rotation := createRotation(t, pr, proj, "/app")

		// Assert
		require.Equal(t, http.StatusOK, inside)
		require.Equal(t, http.StatusForbidden, outside)
		require.Equalf(t, http.StatusForbidden, rotation.StatusCode(), "creating a rotation: %s", rotation.Body)
		require.Equal(t, map[string]string{"API_KEY": "plaintext", "NEW_KEY": "v"}, secretsAt(t, proj, "/app"))
		require.Empty(t, secretsAt(t, proj, "/"))
	})

	t.Run("should let a manage holder write syncs and rotations in the folder where an edit holder cannot", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		manager, editor := tn.NewMachineIdentity(t), tn.NewMachineIdentity(t)
		proj.Grant(t, manager, "member")
		proj.Grant(t, editor, "member")
		secretmanager.GrantFolderAccess(t, proj, manager, at("/app"), secretmanager.FolderManage)
		secretmanager.GrantFolderAccess(t, proj, editor, at("/app"), secretmanager.FolderEdit)

		// Action
		byManager := createSync(t, manager, proj, conn, "/app")
		byEditor := createSync(t, editor, proj, conn, "/app")
		rotationByManager := createRotation(t, manager, proj, "/app")

		// Assert
		require.Equalf(t, http.StatusOK, byManager.StatusCode(), "creating a sync as the manager: %s", byManager.Body)
		require.Equalf(t, http.StatusForbidden, byEditor.StatusCode(), "creating a sync as the editor: %s", byEditor.Body)
		require.Equalf(t, http.StatusNotFound, rotationByManager.StatusCode(),
			"the manager passes the rotation permission check and fails only on the made-up connection: %s", rotationByManager.Body)
		require.Contains(t, string(rotationByManager.Body), "Could not find App Connection with ID")
	})

	t.Run("should let a full-access holder grant others and delete folders inside the granted one but not the folder itself", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app/child")
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"), fixture.WithRoles("no-access"))
		other := proj.NewUser(t, fixture.WithPrincipalName("other"), fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, owner, at("/app"), secretmanager.FolderFullAccess)
		deleteAs := func(name, parent string) *api.DeleteSecretFolderResponse {
			res, err := owner.API.DeleteSecretFolderWithResponse(t.Context(), name, api.DeleteSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Path: &parent,
			})
			require.NoError(t, err)
			return res
		}

		// Action
		granted := grantAs(t, owner, proj, other, at("/app"), secretmanager.FolderRead, nil)
		child := deleteAs("child", "/app")
		itself := deleteAs("app", "/")

		// Assert
		require.Equalf(t, http.StatusOK, granted.status, "granting as the full-access holder: %s", granted.body)
		require.Len(t, grantsOf(t, proj, other), 1)
		require.Equalf(t, http.StatusOK, child.StatusCode(), "deleting a folder inside the granted one: %s", child.Body)
		require.Equalf(t, http.StatusForbidden, itself.StatusCode(),
			"a folder delete is checked at its parent's path, which the grant does not cover: %s", itself.Body)
		require.Equal(t, "/app", grantsOf(t, proj, owner)[0].SecretPath)
	})
}

func createSync(t *testing.T, pr *harness.Principal, proj *fixture.Project, conn *fixture.AppConnection, secretPath string) *api.CreateGitHubSecretSyncResponse {
	t.Helper()
	var dest api.CreateGitHubSecretSyncJSONBody_DestinationConfig
	require.NoError(t, dest.FromCreateGitHubSecretSyncJSONBodyDestinationConfig1(
		api.CreateGitHubSecretSyncJSONBodyDestinationConfig1{Owner: "acme", Repo: "app", Scope: "repository"}))
	body := api.CreateGitHubSecretSyncJSONRequestBody{
		Name:              "sync-" + uuid.NewString()[:8],
		ProjectId:         proj.ID,
		ConnectionId:      conn.ID,
		Environment:       "dev",
		SecretPath:        secretPath,
		DestinationConfig: dest,
		IsAutoSyncEnabled: new(false),
	}
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	res, err := pr.API.CreateGitHubSecretSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

// createRotation names a connection that does not exist, so it can only get as far as
// the permission check and the lookups after it.
func createRotation(t *testing.T, pr *harness.Principal, proj *fixture.Project, secretPath string) *api.CreatePostgreSQLCredentialsRotationResponse {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"name":             "rotation-" + uuid.NewString()[:8],
		"projectId":        proj.ID,
		"environment":      "dev",
		"secretPath":       secretPath,
		"connectionId":     uuid.NewString(),
		"rotationInterval": 30,
		"parameters":       map[string]any{"username1": "app_a", "username2": "app_b"},
		"secretsMapping":   map[string]any{"username": "DB_USER", "password": "DB_PASS"},
	})
	require.NoError(t, err)
	res, err := pr.API.CreatePostgreSQLCredentialsRotationWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}
