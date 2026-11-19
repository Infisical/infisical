package secretreadlimit_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// seedImportChain puts three secrets in /app and three in /shared, makes /app import
// /shared, and makes /merged import /app, so /merged reaches /shared only through a
// nested import. One folder fits the limit; two together do not.
func seedImportChain(t *testing.T, h *harness.Stack) *fixture.Project {
	t.Helper()
	tn := h.NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	for _, folder := range []string{"/app", "/shared", "/merged"} {
		secretmanager.CreateFolder(t, proj, "dev", folder)
	}
	for i := range 3 {
		secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("APP_%d", i), "value", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("SHARED_%d", i), "value", secretmanager.WithPath("/shared"))
	}
	secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/shared"}, secretmanager.IntoPath("/app"))
	secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/app"}, secretmanager.IntoPath("/merged"))
	return proj
}

func listSecrets(t *testing.T, proj *fixture.Project, secretPath string,
	includeImports api.ListSecretsV4ParamsIncludeImports, recursive api.ListSecretsV4ParamsRecursive,
) *api.ListSecretsV4Response {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:      &proj.ID,
		Environment:    new("dev"),
		SecretPath:     &secretPath,
		IncludeImports: &includeImports,
		Recursive:      &recursive,
	})
	require.NoError(t, err)
	return res
}

func requireReadLimitRefusal(t *testing.T, status int, body []byte, secretPath string) {
	t.Helper()
	require.Equalf(t, http.StatusBadRequest, status, "body: %s", apierr.Body(body))
	require.Equal(t, fmt.Sprintf(
		"Reading secret path '%s' in environment 'dev' would return more than %d secrets, counting imported secrets and subfolders, which is the most a single request can return. Read a narrower secret path, or turn off recursive or include imports.",
		secretPath, maxSecretsPerRead), apierr.Message(body))
}

func TestSecretList_ReadLimit(t *testing.T) {
	h := harness.From(t)

	t.Run("should return a folder's secrets when they fit the limit", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res := listSecrets(t, proj, "/app", api.ListSecretsV4ParamsIncludeImportsFalse, api.ListSecretsV4ParamsRecursiveFalse)

		// Assert
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.Secrets, 3)
	})

	t.Run("should refuse when imported secrets take the list over the limit", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res := listSecrets(t, proj, "/app", api.ListSecretsV4ParamsIncludeImportsTrue, api.ListSecretsV4ParamsRecursiveFalse)

		// Assert
		requireReadLimitRefusal(t, res.StatusCode(), res.Body, "/app")
	})

	t.Run("should refuse when subfolders take a recursive list over the limit", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res := listSecrets(t, proj, "/", api.ListSecretsV4ParamsIncludeImportsFalse, api.ListSecretsV4ParamsRecursiveTrue)

		// Assert
		requireReadLimitRefusal(t, res.StatusCode(), res.Body, "/")
	})
}

func TestImportedSecrets_ReadLimit(t *testing.T) {
	h := harness.From(t)

	t.Run("should return imported secrets when they fit the limit", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res, err := proj.Tenant().Admin.API.GetRawSecretsFromImportsWithResponse(t.Context(),
			&api.GetRawSecretsFromImportsParams{ProjectId: proj.ID, Environment: "dev", Path: new("/app")})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.Secrets, 1)
		require.Len(t, res.JSON200.Secrets[0].Secrets, 3)
	})

	t.Run("should refuse when nested imports take the imported secrets over the limit", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res, err := proj.Tenant().Admin.API.GetRawSecretsFromImportsWithResponse(t.Context(),
			&api.GetRawSecretsFromImportsParams{ProjectId: proj.ID, Environment: "dev", Path: new("/merged")})

		// Assert
		require.NoError(t, err)
		requireReadLimitRefusal(t, res.StatusCode(), res.Body, "/merged")
	})

	t.Run("should not limit the imported secrets the dashboard reads", func(t *testing.T) {
		// Setup
		proj := seedImportChain(t, h)

		// Action
		res, err := proj.Tenant().Admin.API.GetSecretImportsWithResponse(t.Context(),
			&api.GetSecretImportsParams{ProjectId: proj.ID, Environment: "dev", Path: new("/merged")})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.Secrets, 1)
		require.Len(t, res.JSON200.Secrets[0].Secrets, 6)
	})
}
