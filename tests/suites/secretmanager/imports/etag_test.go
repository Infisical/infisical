package imports_test

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

func TestSecretImport_ETag(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// importingProject makes dev:/app import dev:/shared, which holds values that do not survive a careless
	// round trip through the cache.
	importingProject := func(t *testing.T) (*fixture.Project, *api.GetRawSecretsFromImportsParams) {
		t.Helper()
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateFolder(t, proj, "dev", "/shared")
		for name, value := range map[string]string{
			"PLAIN":     "plain",
			"UNICODE":   "héllo wörld ✓ 日本語 🚀 \"quoted\" \\backslash",
			"MULTILINE": "line one\nline two\n\tindented",
		} {
			secretmanager.CreateSecret(t, proj, "dev", name, value, secretmanager.WithPath("/shared"))
		}
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/shared"},
			secretmanager.IntoPath("/app"))
		return proj, &api.GetRawSecretsFromImportsParams{ProjectId: proj.ID, Environment: "dev", Path: new("/app")}
	}

	ifNoneMatch := func(etag string) api.RequestEditorFn {
		return func(_ context.Context, req *http.Request) error {
			req.Header.Set("If-None-Match", etag)
			return nil
		}
	}

	t.Run("should answer not modified for a matching etag and the same body without one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, params := importingProject(t)
		admin := proj.Tenant().Admin
		first, err := admin.API.GetRawSecretsFromImportsWithResponse(t.Context(), params)
		require.NoError(t, err)
		require.NotNilf(t, first.JSON200, "listing imported secrets returned %d: %s", first.StatusCode(), apierr.Body(first.Body))
		etag := first.HTTPResponse.Header.Get("ETag")
		require.NotEmpty(t, etag, "the import list carried no ETag")

		// Action
		unchanged, err := admin.API.GetRawSecretsFromImportsWithResponse(t.Context(), params, ifNoneMatch(etag))
		require.NoError(t, err)
		again, err := admin.API.GetRawSecretsFromImportsWithResponse(t.Context(), params)
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusNotModified, unchanged.StatusCode())
		require.Empty(t, unchanged.Body)
		require.NotNilf(t, again.JSON200, "listing imported secrets again returned %d: %s", again.StatusCode(), apierr.Body(again.Body))
		require.Equal(t, etag, again.HTTPResponse.Header.Get("ETag"))
		require.JSONEq(t, string(first.Body), string(again.Body))
		values := map[string]string{}
		for _, secret := range first.JSON200.Secrets[0].Secrets {
			values[secret.SecretKey] = secret.SecretValue
		}
		require.Equal(t, map[string]string{
			"PLAIN":     "plain",
			"UNICODE":   "héllo wörld ✓ 日本語 🚀 \"quoted\" \\backslash",
			"MULTILINE": "line one\nline two\n\tindented",
		}, values)
	})

	t.Run("should return a new body and etag after an imported secret changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, params := importingProject(t)
		admin := proj.Tenant().Admin
		first, err := admin.API.GetRawSecretsFromImportsWithResponse(t.Context(), params)
		require.NoError(t, err)
		etag := first.HTTPResponse.Header.Get("ETag")
		require.NotEmpty(t, etag, "the import list carried no ETag")

		// Action
		secretmanager.UpdateSecret(t, proj, "dev", "PLAIN", "rotated", secretmanager.WithPath("/shared"))
		changed, err := admin.API.GetRawSecretsFromImportsWithResponse(t.Context(), params, ifNoneMatch(etag))
		require.NoError(t, err)

		// Assert
		require.NotNilf(t, changed.JSON200, "listing after a write returned %d: %s", changed.StatusCode(), apierr.Body(changed.Body))
		require.NotEmpty(t, changed.HTTPResponse.Header.Get("ETag"))
		require.NotEqual(t, etag, changed.HTTPResponse.Header.Get("ETag"))
		values := map[string]string{}
		for _, secret := range changed.JSON200.Secrets[0].Secrets {
			values[secret.SecretKey] = secret.SecretValue
		}
		require.Equal(t, "rotated", values["PLAIN"])
	})
}
