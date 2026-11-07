//go:build integration

package folders_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sort"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secretmanager/folder"
	"github.com/infisical/api/internal/server/api/shared"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/tests/infra"
)

var (
	stack       *infra.Stack
	testProject *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	testProject = stack.NodeJS().MustCreateProject("folders-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

func newTestServer(t *testing.T, identityID, orgID string) *httptest.Server {
	t.Helper()

	handler := folder.NewHandler(&folder.Deps{
		Logger:     infra.NopLogger(),
		Permission: permission.NewService(t.Context(), infra.NopLogger(), &permission.Deps{DB: stack.DB()}),
		Folders:    secretfolder.NewService(t.Context(), infra.NopLogger(), &secretfolder.Deps{DB: stack.DB()}),
	})

	authMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := auth.WithIdentity(r.Context(), &auth.Identity{
				AuthMode: auth.AuthModeIdentityAccessToken,
				Actor:    auth.ActorTypeIdentity,
				ActorID:  uuid.MustParse(identityID),
				OrgID:    uuid.MustParse(orgID),
			})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	return httptest.NewServer(folder.NewRouter(
		handler,
		folder.WithMiddleware(authMiddleware),
		folder.WithErrorHandler(shared.NewErrorHandler(infra.NopLogger())),
	))
}

func TestListSecretFolders_ResponseCoversEverySecretFoldersColumn(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "folders-drift-identity")
	nodejs.AddIdentityToProject(t, testProject.ID, identity.ID, []infra.RoleAssignment{{Role: "admin"}})
	nodejs.CreateFolder(t, testProject.ID, testProject.EnvSlug, "/", "drift")

	srv := newTestServer(t, identity.ID, nodejs.OrgID())
	defer srv.Close()

	query := url.Values{}
	query.Set("projectId", testProject.ID)
	query.Set("environment", testProject.EnvSlug)
	query.Set("path", "/")
	query.Set("recursive", "true")

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"/api/v2/folders?"+query.Encode(), http.NoBody)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, resp.StatusCode, string(body))

	var parsed struct {
		Folders []map[string]json.RawMessage `json:"folders"`
	}
	require.NoError(t, json.Unmarshal(body, &parsed))
	require.NotEmpty(t, parsed.Folders)

	rows, err := stack.DB().Primary().Query(t.Context(),
		`SELECT column_name FROM information_schema.columns WHERE table_name = @table AND table_schema = current_schema()`,
		pgx.NamedArgs{"table": "secret_folders"})
	require.NoError(t, err)
	columns, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	require.NotEmpty(t, columns)

	keys := make([]string, 0, len(parsed.Folders[0]))
	for key := range parsed.Folders[0] {
		if key != "relativePath" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	sort.Strings(columns)
	require.Equal(t, columns, keys, "the Go response must expose exactly the secret_folders columns Node returns; update folder.SecretFolder after a migration")
}
