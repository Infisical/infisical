package folders_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func listFolders(t *testing.T, client *api.ClientWithResponses, proj, env, path string, editors ...api.RequestEditorFn) *api.ListSecretFoldersResponse {
	t.Helper()
	res, err := client.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
		ProjectId: proj, Environment: env, Path: path,
	}, editors...)
	require.NoError(t, err)
	return res
}

func requireFolders(t *testing.T, res *api.ListSecretFoldersResponse) {
	t.Helper()
	require.NotNilf(t, res.JSON200, "listing folders returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func folderPaths(res *api.ListSecretFoldersResponse) []string {
	paths := []string{}
	for _, f := range res.JSON200.Folders {
		paths = append(paths, *f.RelativePath)
	}
	return paths
}

func listNames(res *api.ListSecretFoldersResponse) []string {
	names := []string{}
	for _, f := range res.JSON200.Folders {
		names = append(names, f.Name)
	}
	return names
}

func errorMessage(t *testing.T, body []byte) string {
	t.Helper()
	var e struct {
		Message string `json:"message"`
	}
	require.NoErrorf(t, json.Unmarshal(body, &e), "decoding the error body: %s", apierr.Body(body))
	return e.Message
}

// lastModified waits for the queue worker, which stamps a folder some time after a
// secret in it changes, and returns the stamp.
func lastModified(t *testing.T, proj *fixture.Project, path, name string) time.Time {
	t.Helper()
	var stamp time.Time
	wait.Until(t, "the folder to record when its secrets last changed", func() bool {
		res, err := proj.Tenant().Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
			ProjectId: proj.ID, Environment: "dev", Path: path,
		})
		if err != nil || res.JSON200 == nil {
			return false
		}
		for _, f := range res.JSON200.Folders {
			if f.Name == name && f.LastSecretModified != nil {
				stamp = *f.LastSecretModified
				return true
			}
		}
		return false
	})
	return stamp
}

func newReadServiceToken(t *testing.T, proj *fixture.Project, scopePath string) *api.ClientWithResponses {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"name":         "token",
		"workspaceId":  proj.ID,
		"scopes":       []map[string]string{{"environment": "dev", "secretPath": scopePath}},
		"permissions":  []string{"read"},
		"expiresIn":    3600,
		"encryptedKey": "unused",
		"iv":           "unused",
		"tag":          "unused",
	})
	require.NoError(t, err)
	res, err := proj.Tenant().Admin.API.CreateServiceTokenWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a service token returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return proj.Tenant().Client(t, res.JSON200.ServiceToken)
}

func TestFolder_ListParity(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer 200 with an empty list when the path has no folders", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/leaf")

		// Action
		res := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/leaf")

		// Assert
		requireFolders(t, res)
		require.JSONEq(t, `{"folders":[]}`, string(res.Body))
	})

	t.Run("should answer 404 naming the slug when the environment does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		res := listFolders(t, proj.Tenant().Admin.API, proj.ID, "nope", "/")

		// Assert
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Environment with slug 'nope' not found", errorMessage(t, res.Body))
	})

	t.Run("should sort a recursive list by folder name, not by path, and leave out the parent", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/root/b")
		secretmanager.CreateFolder(t, proj, "dev", "/root/a/z")
		secretmanager.CreateFolder(t, proj, "dev", "/root/a/c")

		// Action
		res := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/root", recursive)

		// Assert
		requireFolders(t, res)
		require.Equal(t, []string{"a", "b", "c", "z"}, listNames(res))
		require.Equal(t, []string{"/a", "/b", "/a/c", "/a/z"}, folderPaths(res))
	})

	t.Run("should keep folders modified at or after lastSecretModified and drop the rest and the never-modified", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/touched")
		secretmanager.CreateFolder(t, proj, "dev", "/untouched")
		secretmanager.CreateSecret(t, proj, "dev", "KEY", "v", secretmanager.WithPath("/touched"))
		stamp := lastModified(t, proj, "/", "touched")
		at := func(ts time.Time) api.RequestEditorFn {
			return func(_ context.Context, req *http.Request) error {
				q := req.URL.Query()
				q.Set("lastSecretModified", ts.UTC().Format("2006-01-02T15:04:05.000Z"))
				req.URL.RawQuery = q.Encode()
				return nil
			}
		}

		// Action
		onTheBoundary := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/", at(stamp))
		justAfter := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/", at(stamp.Add(time.Millisecond)))
		deepOnTheBoundary := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/", at(stamp), recursive)
		deepJustAfter := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/", at(stamp.Add(time.Millisecond)), recursive)

		// Assert
		requireFolders(t, onTheBoundary)
		require.Equal(t, []string{"touched"}, listNames(onTheBoundary))
		requireFolders(t, justAfter)
		require.Empty(t, justAfter.JSON200.Folders)
		requireFolders(t, deepOnTheBoundary)
		require.Equal(t, []string{"touched"}, listNames(deepOnTheBoundary))
		requireFolders(t, deepJustAfter)
		require.Empty(t, deepJustAfter.JSON200.Folders)
	})

	t.Run("should answer 404 for an environment pending deletion and keep answering for the others", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", "/app")
		read, err := tn.Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNil(t, read.JSON200)
		var stagingID string
		for _, e := range read.JSON200.Project.Environments {
			if e.Slug == "staging" {
				stagingID = e.Id
			}
		}
		require.NotEmpty(t, stagingID)
		del, err := tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, stagingID, nil)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting returned %s", apierr.Body(del.Body))

		// Action
		gone := listFolders(t, tn.Admin.API, proj.ID, "staging", "/")
		other := listFolders(t, tn.Admin.API, proj.ID, "dev", "/")

		// Assert
		require.Equal(t, http.StatusNotFound, gone.StatusCode())
		require.Equal(t, "Environment with slug 'staging' not found", errorMessage(t, gone.Body))
		requireFolders(t, other)
	})

	t.Run("should refuse a project that has been deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		del, err := tn.Admin.API.DeleteProjectWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting returned %s", apierr.Body(del.Body))

		// Action
		var res *api.ListSecretFoldersResponse
		wait.Until(t, "the deleted project to stop answering", func() bool {
			res = listFolders(t, tn.Admin.API, proj.ID, "dev", "/")
			return res.StatusCode() != http.StatusOK
		}, wait.Timeout(20*time.Second))

		// Assert
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "body: %s", apierr.Body(res.Body))
	})

	t.Run("should accept a 24-character project ID and answer for it like any other", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := listFolders(t, tn.Admin.API, "507f1f77bcf86cd799439011", "dev", "/")

		// Assert
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "body: %s", apierr.Body(res.Body))
	})

	t.Run("should list a sub-org project's folders to the sub-org and refuse them to the root org's session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		projectID := sub.NewProject(t)
		created, err := sub.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: projectID, Environment: "dev", Name: "app",
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, created.StatusCode(), "creating returned %s", apierr.Body(created.Body))

		// Action
		fromSub := listFolders(t, sub.Admin.API, projectID, "dev", "/")
		fromRoot := listFolders(t, tn.Admin.API, projectID, "dev", "/")

		// Assert
		requireFolders(t, fromSub)
		require.Equal(t, []string{"app"}, listNames(fromSub))
		require.NotEqual(t, http.StatusOK, fromRoot.StatusCode())
	})

	t.Run("should list the same folders to a user, an identity access token and a service token", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateFolder(t, proj, "dev", "/web")
		identity := proj.NewMachineIdentity(t)
		token := newReadServiceToken(t, proj, "/")

		// Action
		asUser := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/")
		asIdentity := listFolders(t, identity.API, proj.ID, "dev", "/")
		asServiceToken := listFolders(t, token, proj.ID, "dev", "/")

		// Assert
		requireFolders(t, asUser)
		requireFolders(t, asIdentity)
		requireFolders(t, asServiceToken)
		require.Equal(t, []string{"app", "web"}, listNames(asUser))
		require.Equal(t, []string{"app", "web"}, listNames(asIdentity))
		require.Equal(t, []string{"app", "web"}, listNames(asServiceToken))
	})

	t.Run("should refuse an org member who is not in the project and a user of another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		outsider := tn.NewUser(t)
		stranger := h.NewTenant(t)

		// Action
		notMember := listFolders(t, outsider.API, proj.ID, "dev", "/")
		otherOrg := listFolders(t, stranger.Admin.API, proj.ID, "dev", "/")

		// Assert
		require.Equalf(t, http.StatusForbidden, notMember.StatusCode(), "body: %s", apierr.Body(notMember.Body))
		require.Equalf(t, http.StatusForbidden, otherOrg.StatusCode(), "body: %s", apierr.Body(otherOrg.Body))
	})

	t.Run("should treat a missing leading slash and a trailing slash as the same path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")

		// Action
		plain := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/app")
		trailing := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "/app/")
		bare := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "app")
		root := listFolders(t, proj.Tenant().Admin.API, proj.ID, "dev", "")

		// Assert
		for _, res := range []*api.ListSecretFoldersResponse{plain, trailing, bare} {
			requireFolders(t, res)
			require.Equal(t, []string{"api"}, listNames(res))
		}
		requireFolders(t, root)
		require.Equal(t, []string{"app"}, listNames(root))
	})
}
