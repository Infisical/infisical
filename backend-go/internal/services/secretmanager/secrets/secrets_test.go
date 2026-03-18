package secrets_test

import (
	"net/http"
	"os"
	"testing"

	secretssvr "github.com/infisical/api/internal/server/gen/http/secrets/server"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
	"github.com/infisical/api/internal/services/shared/permission"
	"github.com/infisical/api/internal/services/shared/secretmanager/secretfolder"
	"github.com/infisical/api/internal/testutil"
	"github.com/stretchr/testify/require"
)

var (
	infra   *testutil.TestInfra
	project *testutil.ProjectSeed
)

func TestMain(m *testing.M) {
	infra = testutil.SetupInfra()
	project = infra.MustCreateProject("secrets-test")
	code := m.Run()
	infra.Teardown()
	os.Exit(code)
}

// setupMux wires the secrets Goa module onto a test mux.
func setupMux(t *testing.T) *testutil.TestMux {
	t.Helper()

	permDAL := permission.NewDAL()
	permLib := permission.NewLib(permDAL)
	secretfolderLib := secretfolder.NewLib()

	svc := secrets.NewService(testutil.NopLogger(), permLib, secretfolderLib)

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
		WithAuth(infra.IdentityToken).
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
		WithAuth(infra.IdentityToken).
		Do().
		ExpectStatus(http.StatusOK).
		ParseJSON(&result)

	require.Equal(t, "test-id-123", result["id"])
}

func TestUpdateSecret(t *testing.T) {
	mux := setupMux(t)

	var result map[string]any
	mux.Request(t, http.MethodPatch, "/api/v1/secret-manager/secrets/test-id-456").
		WithAuth(infra.IdentityToken).
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
		WithAuth(infra.IdentityToken).
		Do().
		ExpectStatus(http.StatusNoContent)
}

func TestListSecrets(t *testing.T) {
	mux := setupMux(t)

	var result []map[string]any
	mux.Request(t, http.MethodGet, "/api/v1/secret-manager/secrets?projectId="+project.ID+"&environment="+project.EnvSlug).
		WithAuth(infra.IdentityToken).
		Do().
		ExpectStatus(http.StatusOK).
		ParseJSON(&result)

	require.NotNil(t, result)
}
