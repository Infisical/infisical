//go:build integration

package projects_test

import (
	"net/http"
	"os"
	"testing"

	projectssvr "github.com/infisical/api/internal/server/gen/http/projects/server"
	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/platform/projects"
	"github.com/infisical/api/internal/services/shared/permission"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
	"github.com/stretchr/testify/require"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// setupMux wires the projects Goa module onto a test mux.
func setupMux(t *testing.T) *testutil.TestMux {
	t.Helper()

	permDAL := permission.NewDAL()
	permLib := permission.NewSharedService(permission.Deps{DAL: permDAL})

	svc := projects.NewService(testutil.NopLogger(), projects.Deps{
		Permission: permLib,
	})

	mux := testutil.NewTestMux()
	endpoints := genprojects.NewEndpoints(svc)
	server := projectssvr.New(endpoints, mux.Mux, mux.Dec, mux.Enc, mux.Eh, nil)
	projectssvr.Mount(mux.Mux, server)

	return mux
}

func TestGetHealth(t *testing.T) {
	mux := setupMux(t)

	mux.Request(t, http.MethodGet, "/api/v1/platform/projects/health").
		Do().
		ExpectStatus(http.StatusOK)
}

func TestCreateProject(t *testing.T) {
	mux := setupMux(t)

	var result map[string]any
	mux.Request(t, http.MethodPost, "/api/v1/platform/projects").
		WithAuth(stack.NodeJS().IdentityToken()).
		WithBody(map[string]any{
			"name":  "my-new-project",
			"orgId": stack.NodeJS().OrgID(),
		}).
		Do().
		ExpectStatus(http.StatusCreated).
		ParseJSON(&result)

	require.Equal(t, "my-new-project", result["name"])
	require.Equal(t, stack.NodeJS().OrgID(), result["orgId"])
	require.NotEmpty(t, result["id"])
}
