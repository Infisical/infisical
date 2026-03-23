//go:build integration

package secrets_test

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	secretssvr "github.com/infisical/api/internal/server/gen/http/secrets/server"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
	"github.com/infisical/api/internal/services/shared/auth"
	"github.com/infisical/api/internal/services/shared/permission"
	smShared "github.com/infisical/api/internal/services/shared/secretmanager"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
)

var (
	stack   *infra.Stack
	project *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	project = stack.NodeJS().MustCreateProject("secrets-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// setupMux wires the secrets Goa module onto a test mux.
func setupMux(t *testing.T) *testutil.TestMux {
	t.Helper()

	permDAL := permission.NewDAL(stack.DB())
	permLib := permission.NewSharedService(testutil.NopLogger(), permission.Deps{DAL: permDAL})

	authDAL := auth.NewDAL(stack.DB())
	authHandler := auth.NewAuthHandler(authDAL, infra.AuthSecret)

	smSharedSvcs := smShared.NewSharedServices(smShared.SharedServicesDeps{DB: stack.DB()})

	svc := secrets.NewService(testutil.NopLogger(), secrets.Deps{
		AuthHandler:  authHandler,
		Permission:   permLib,
		SecretFolder: smSharedSvcs.SecretFolder,
	})

	mux := testutil.NewTestMux()
	endpoints := gensecrets.NewEndpoints(svc)
	server := secretssvr.New(endpoints, mux.Mux, mux.Dec, mux.Enc, mux.Eh, nil)
	secretssvr.Mount(mux.Mux, server)

	return mux
}

func TestGetHealth(t *testing.T) {
	mux := setupMux(t)

	mux.Request(t, http.MethodGet, "/api/v1/secret-manager/secrets/health").
		Do().
		ExpectStatus(http.StatusOK)
}

func TestCreateSecret(t *testing.T) {
	mux := setupMux(t)

	var result map[string]any
	mux.Request(t, http.MethodPost, "/api/v1/secret-manager/secrets").
		WithAuth(stack.NodeJS().IdentityToken()).
		WithBody(map[string]any{
			"key":         "DB_PASSWORD",
			"value":       "s3cret",
			"environment": project.EnvSlug,
			"projectId":   project.ID,
		}).
		Do().
		ExpectStatus(http.StatusCreated).
		ParseJSON(&result)

	require.Equal(t, "DB_PASSWORD", result["key"])
	require.Equal(t, "s3cret", result["value"])
}

func TestGetSecret(t *testing.T) {
	mux := setupMux(t)

	var result map[string]any
	mux.Request(t, http.MethodGet, "/api/v1/secret-manager/secrets/test-id-123").
		WithAuth(stack.NodeJS().IdentityToken()).
		Do().
		ExpectStatus(http.StatusOK).
		ParseJSON(&result)

	require.Equal(t, "test-id-123", result["id"])
}

func TestUpdateSecret(t *testing.T) {
	mux := setupMux(t)

	var result map[string]any
	mux.Request(t, http.MethodPatch, "/api/v1/secret-manager/secrets/test-id-456").
		WithAuth(stack.NodeJS().IdentityToken()).
		WithBody(map[string]any{
			"key":   "UPDATED_KEY",
			"value": "updated_value",
		}).
		Do().
		ExpectStatus(http.StatusOK).
		ParseJSON(&result)

	require.Equal(t, "test-id-456", result["id"])
}

func TestDeleteSecret(t *testing.T) {
	mux := setupMux(t)

	mux.Request(t, http.MethodDelete, "/api/v1/secret-manager/secrets/test-id-789").
		WithAuth(stack.NodeJS().IdentityToken()).
		Do().
		ExpectStatus(http.StatusNoContent)
}

func TestListSecrets(t *testing.T) {
	mux := setupMux(t)

	var result []map[string]any
	mux.Request(t, http.MethodGet, "/api/v1/secret-manager/secrets?projectId="+project.ID+"&environment="+project.EnvSlug).
		WithAuth(stack.NodeJS().IdentityToken()).
		Do().
		ExpectStatus(http.StatusOK).
		ParseJSON(&result)

	require.NotNil(t, result)
}
