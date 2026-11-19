package folders_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// folderNames lists the folders directly under a path, as the admin sees them.
func folderNames(t *testing.T, proj *fixture.Project, env, parentPath string) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
		ProjectId: proj.ID, Environment: env, Path: parentPath,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing folders in %s:%s returned %d: %s",
		env, parentPath, res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, f := range res.JSON200.Folders {
		names = append(names, f.Name)
	}
	return names
}

// secretKeys lists the secret names in one folder, or nil when the folder does not
// exist, so a test can tell "moved away" from "emptied".
func secretKeys(t *testing.T, proj *fixture.Project, env, secretPath string) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId: &proj.ID, Environment: &env, SecretPath: &secretPath,
	})
	require.NoError(t, err)
	if res.StatusCode() == http.StatusNotFound {
		return nil
	}
	require.NotNilf(t, res.JSON200, "listing secrets in %s:%s returned %d: %s",
		env, secretPath, res.StatusCode(), apierr.Body(res.Body))
	keys := []string{}
	for _, s := range res.JSON200.Secrets {
		keys = append(keys, s.SecretKey)
	}
	return keys
}

// recursive asks a folder list for the whole subtree. The generated parameter is a
// union the client cannot build, so the query is set on the request.
func recursive(_ context.Context, req *http.Request) error {
	q := req.URL.Query()
	q.Set("recursive", "true")
	req.URL.RawQuery = q.Encode()
	return nil
}

func moveFolder(t *testing.T, actor *harness.Principal, proj *fixture.Project, folderID uuid.UUID, destEnv, destPath string) *api.MoveSecretFolderResponse {
	t.Helper()
	res, err := actor.API.MoveSecretFolderWithResponse(t.Context(), api.MoveSecretFolderJSONRequestBody{
		ProjectId:              proj.ID,
		FolderId:               folderID,
		DestinationEnvironment: destEnv,
		DestinationPath:        &destPath,
	})
	require.NoError(t, err)
	return res
}
