//go:build integration

package projects_test

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/server/api/platform/projects"
	projectssvr "github.com/infisical/api/internal/server/gen/http/projects/server"
	genprojects "github.com/infisical/api/internal/server/gen/projects"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
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

	permLib := permission.NewService(testutil.NopLogger(), &permission.Deps{DB: stack.DB()})

	authenticator := apiauth.NewAuthenticator(stack.DB(), infra.AuthSecret, keystore.NewMemoryKeyStore())

	svc := projects.NewService(testutil.NopLogger(), projects.Deps{
		Authenticator: authenticator,
		Permission:    permLib,
	})

	mux := testutil.NewTestMux()
	endpoints := genprojects.NewEndpoints(svc)
	server := projectssvr.New(endpoints, mux.Mux, mux.Dec, mux.Enc, mux.Eh, nil)
	projectssvr.Mount(mux.Mux, server)

	return mux
}

func TestGetHealth_ReturnsOK(t *testing.T) {
	mux := setupMux(t)

	mux.Request(t, http.MethodGet, "/api/v1/platform/projects/health").
		Do().
		ExpectStatus(http.StatusOK)
}

func TestCreateProject_Success(t *testing.T) {
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
