package secrets_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecret_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the secrets in the requested environment and path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "root")
		secretmanager.CreateSecret(t, proj, "dev", "APP_KEY", "app", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "prod", "ROOT_KEY", "prod")

		// Action
		secrets := secretmanager.ListSecrets(t, proj, "dev")

		// Assert
		require.Len(t, secrets, 1)
		require.Equal(t, "ROOT_KEY", secrets[0].Key)
		require.Equal(t, "root", secrets[0].Value)
	})

	t.Run("should include subfolder secrets with their paths when listing recursively", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "root")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api", secretmanager.WithPath("/app/api"))

		// Action
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId:   &proj.ID,
			Environment: new("dev"),
			Recursive:   new(api.ListSecretsV4ParamsRecursiveTrue),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), res.Body)
		paths := map[string]string{}
		for _, s := range res.JSON200.Secrets {
			require.NotNil(t, s.SecretPath)
			paths[s.SecretKey] = *s.SecretPath
		}
		require.Equal(t, map[string]string{"ROOT_KEY": "/", "API_KEY": "/app/api"}, paths)
	})

	t.Run("should return the secrets carrying any requested tag and leave out the rest", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		backend, billing, search := newTag(t, proj, "backend"), newTag(t, proj, "billing"), newTag(t, proj, "search")
		for name, tags := range map[string][]string{
			"BACKEND_KEY": {backend}, "BILLING_KEY": {billing}, "SEARCH_KEY": {search}, "UNTAGGED": {},
		} {
			res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), name,
				api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v", TagIds: &tags})
			require.NoError(t, err)
			require.Equalf(t, http.StatusOK, res.StatusCode(), "creating %s returned %s", name, res.Body)
		}

		// Action
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId:   &proj.ID,
			Environment: new("dev"),
			TagSlugs:    new("backend,billing"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), res.Body)
		keys := make([]string, 0, len(res.JSON200.Secrets))
		for _, s := range res.JSON200.Secrets {
			keys = append(keys, s.SecretKey)
		}
		require.ElementsMatch(t, []string{"BACKEND_KEY", "BILLING_KEY"}, keys)
	})

	t.Run("should return only the secrets whose metadata matches the filter", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for name, team := range map[string]string{"PAYMENTS_KEY": "payments", "SEARCH_KEY": "search"} {
			res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
				ProjectId:      proj.ID,
				Environment:    "dev",
				SecretValue:    "v",
				SecretMetadata: &[]secretMetadataEntry{{Key: "team", Value: new(team)}},
			})
			require.NoError(t, err)
			require.Equalf(t, http.StatusOK, res.StatusCode(), "creating %s returned %s", name, res.Body)
		}

		// Action
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId:      &proj.ID,
			Environment:    new("dev"),
			MetadataFilter: new("key=team,value=payments"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Secrets, 1)
		require.Equal(t, "PAYMENTS_KEY", res.JSON200.Secrets[0].SecretKey)
	})

	t.Run("should return imported secrets only when imports are included", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "prod", "SHARED_KEY", "from-prod")
		imp, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), api.CreateSecretImportJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: "dev",
			Path:        new("/"),
			Import: struct {
				Environment     string  `json:"environment"`
				Path            string  `json:"path"`
				SourceProjectId *string `json:"sourceProjectId,omitempty"`
			}{Environment: "prod", Path: "/"},
		})
		require.NoError(t, err)
		require.NotNilf(t, imp.JSON200, "creating the import returned %d: %s", imp.StatusCode(), apierr.Body(imp.Body))

		// Action
		included, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"),
		})
		require.NoError(t, err)
		excluded, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"), IncludeImports: new(api.ListSecretsV4ParamsIncludeImportsFalse),
		})
		require.NoError(t, err)

		// Assert
		require.NotNilf(t, included.JSON200, "listing returned %d: %s", included.StatusCode(), included.Body)
		require.NotNil(t, included.JSON200.Imports)
		require.Len(t, *included.JSON200.Imports, 1)
		imported := (*included.JSON200.Imports)[0]
		require.Equal(t, "prod", imported.Environment)
		require.Len(t, imported.Secrets, 1)
		require.Equal(t, "from-prod", imported.Secrets[0].SecretValue)

		require.NotNilf(t, excluded.JSON200, "listing returned %d: %s", excluded.StatusCode(), excluded.Body)
		require.True(t, excluded.JSON200.Imports == nil || len(*excluded.JSON200.Imports) == 0,
			"imports were returned although they were excluded: %s", excluded.Body)
	})

	t.Run("should answer not modified for a matching etag and a new body after a write", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "old")
		params := &api.ListSecretsV4Params{ProjectId: &proj.ID, Environment: new("dev")}
		first, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), params)
		require.NoError(t, err)
		etag := first.HTTPResponse.Header.Get("ETag")
		require.NotEmpty(t, etag, "the list response carried no ETag")
		ifNoneMatch := func(_ context.Context, req *http.Request) error {
			req.Header.Set("If-None-Match", etag)
			return nil
		}

		// Action
		unchanged, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), params, ifNoneMatch)
		require.NoError(t, err)
		secretmanager.UpdateSecret(t, proj, "dev", "API_KEY", "new")
		changed, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), params, ifNoneMatch)
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusNotModified, unchanged.StatusCode())
		require.NotNilf(t, changed.JSON200, "listing after a write returned %d: %s", changed.StatusCode(), changed.Body)
		require.Equal(t, "new", changed.JSON200.Secrets[0].SecretValue)
	})

	t.Run("should refuse a list without an environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{ProjectId: &proj.ID})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Missing project id or environment", res.JSON400.Message)
	})

	t.Run("should return not found for a path that does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"), SecretPath: new("/nope"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t,
			"Folder with path '/nope' in environment 'dev' was not found. Please ensure the environment slug and secret path is correct.",
			res.JSON404.Message)
	})
}
