package history_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

type commit struct {
	ID      string
	Message string
	Actor   string
	Secrets float32
	Added   float32
	Updated float32
	Deleted float32
}

// commitsAt lists a folder's commits, newest first.
func commitsAt(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, folderPath string) []commit {
	t.Helper()
	res, err := pr.API.ListFolderCommitsWithResponse(t.Context(), &api.ListFolderCommitsParams{
		ProjectId:   proj.ID,
		Environment: env,
		Path:        &folderPath,
		Limit:       new(float32(100)),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing commits in %s:%s returned %d: %s",
		env, folderPath, res.StatusCode(), apierr.Body(res.Body))
	commits := make([]commit, 0, len(res.JSON200.Commits))
	for _, c := range res.JSON200.Commits {
		msg := ""
		if c.Message != nil {
			msg = *c.Message
		}
		commits = append(commits, commit{
			ID: c.Id, Message: msg, Actor: c.ActorType, Secrets: c.Summary.SecretCount,
			Added: c.Summary.AddedCount, Updated: c.Summary.UpdatedCount, Deleted: c.Summary.DeletedCount,
		})
	}
	return commits
}

func headCommit(t *testing.T, proj *fixture.Project, env, folderPath string) commit {
	t.Helper()
	commits := commitsAt(t, proj.Tenant().Admin, proj, env, folderPath)
	require.NotEmptyf(t, commits, "%s:%s has no commits", env, folderPath)
	return commits[0]
}

func messages(commits []commit) []string {
	out := make([]string, len(commits))
	for i, c := range commits {
		out[i] = c.Message
	}
	return out
}

// folderID reads a folder's ID from the commit count route, the only PIT read that
// returns it for a path.
func folderID(t *testing.T, proj *fixture.Project, env, folderPath string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetFolderCommitsCountWithResponse(t.Context(), &api.GetFolderCommitsCountParams{
		ProjectId: proj.ID, Environment: env, Path: &folderPath,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the folder at %s:%s returned %d: %s",
		env, folderPath, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.FolderId
}

type version struct {
	ID         string
	Version    float32
	IsRedacted bool
	RedactedBy string
	RedactedAt bool
}

// versionsOf reads a secret's versions from the dashboard route, which is the one that
// reports redaction.
func versionsOf(t *testing.T, pr *harness.Principal, secretID string) []version {
	t.Helper()
	res, err := pr.API.ListSecretVersionsWithResponse(t.Context(), secretID, &api.ListSecretVersionsParams{Offset: 0, Limit: 100})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing versions of %s returned %d: %s", secretID, res.StatusCode(), apierr.Body(res.Body))
	out := make([]version, 0, len(res.JSON200.SecretVersions))
	for _, v := range res.JSON200.SecretVersions {
		by := ""
		if v.RedactedByActor != nil && v.RedactedByActor.Email != nil {
			by = *v.RedactedByActor.Email
		}
		out = append(out, version{
			ID: v.Id, Version: v.Version, IsRedacted: v.IsRedacted, RedactedBy: by,
			RedactedAt: v.RedactedAt != nil,
		})
	}
	return out
}

func versionNumber(t *testing.T, versions []version, n float32) version {
	t.Helper()
	for _, v := range versions {
		if v.Version == n {
			return v
		}
	}
	require.Failf(t, "version missing", "no version %v in %+v", n, versions)
	return version{}
}

func versionValue(t *testing.T, pr *harness.Principal, secretID, n string) string {
	t.Helper()
	res, err := pr.API.GetSecretVersionValueWithResponse(t.Context(), secretID, n)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading version %s of %s returned %d: %s", n, secretID, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Value
}

func postJSON(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(b)
}

func rollback(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, folderID, commitID string, deep bool) (*api.RollbackFolderCommitResponse, error) {
	t.Helper()
	return pr.API.RollbackFolderCommitWithResponse(t.Context(), commitID, api.RollbackFolderCommitJSONRequestBody{
		ProjectId: proj.ID, Environment: env, FolderId: folderID, DeepRollback: &deep,
	})
}

func requireStatus(t *testing.T, want int, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "returned %d: %s", got, apierr.Body(body))
}
