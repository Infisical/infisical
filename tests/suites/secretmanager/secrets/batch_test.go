package secrets_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_Batch(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	createBody := func(proj *fixture.Project, values map[string]string) api.CreateManySecretsV4JSONRequestBody {
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, len(values))[:len(values)]
		i := 0
		for key, value := range values {
			body.Secrets[i].SecretKey, body.Secrets[i].SecretValue = key, value
			i++
		}
		return body
	}

	valuesOf := func(t *testing.T, proj *fixture.Project, opts ...secretmanager.SecretOption) map[string]string {
		t.Helper()
		values := map[string]string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev", opts...) {
			values[s.Key] = s.Value
		}
		return values
	}

	t.Run("should create every secret in one call", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		want := map[string]string{"A": "a", "B": "b", "C": "c"}

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(), createBody(proj, want))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch create returned %s", res.Body)
		require.Equal(t, want, valuesOf(t, proj))
	})

	t.Run("should refuse the whole batch and create none of it when one name already exists", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "B", "original")

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(),
			createBody(proj, map[string]string{"A": "a", "B": "b", "C": "c"}))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret already exists: 'B' in path '/' of environment 'dev'", res.JSON400.Message)
		require.Equal(t, map[string]string{"B": "original"}, valuesOf(t, proj))
	})

	t.Run("should update every secret's value", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "old-a")
		secretmanager.CreateSecret(t, proj, "dev", "B", "old-b")
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", new("new-a")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "B", new("new-b")

		// Action
		res, err := tn.Admin.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch update returned %s", res.Body)
		require.Equal(t, map[string]string{"A": "new-a", "B": "new-b"}, valuesOf(t, proj))
	})

	t.Run("should refuse the whole update and change nothing when one name does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "old-a")
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", Mode: new(api.FailOnNotFound)}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", new("new-a")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "MISSING", new("value")

		// Action
		res, err := tn.Admin.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Secret does not exist: MISSING in path /", res.JSON404.Message)
		require.Equal(t, map[string]string{"A": "old-a"}, valuesOf(t, proj))
	})

	t.Run("should create the missing secrets when updating in upsert mode", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "old")
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", Mode: new(api.Upsert)}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "EXISTING", new("new")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "BRAND_NEW", new("created")

		// Action
		res, err := tn.Admin.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "upsert returned %s", res.Body)
		require.Equal(t, map[string]string{"EXISTING": "new", "BRAND_NEW": "created"}, valuesOf(t, proj))
	})

	t.Run("should write each secret to its own path when upserting with per-secret paths", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", Mode: new(api.Upsert)}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue, body.Secrets[0].SecretPath = "ROOT_KEY", new("root"), new("/")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue, body.Secrets[1].SecretPath = "APP_KEY", new("app"), new("/app")

		// Action
		res, err := tn.Admin.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "upsert returned %s", res.Body)
		require.Equal(t, map[string]string{"ROOT_KEY": "root"}, valuesOf(t, proj))
		require.Equal(t, map[string]string{"APP_KEY": "app"}, valuesOf(t, proj, secretmanager.WithPath("/app")))
	})

	t.Run("should delete every listed secret and keep the rest", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, key := range []string{"A", "B", "KEPT"} {
			secretmanager.CreateSecret(t, proj, "dev", key, "value")
		}
		body := api.DeleteManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[1].SecretKey = "A", "B"

		// Action
		res, err := tn.Admin.API.DeleteManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch delete returned %s", res.Body)
		require.Equal(t, map[string]string{"KEPT": "value"}, valuesOf(t, proj))
	})

	t.Run("should refuse the whole delete and keep every secret when one name does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "value")
		body := api.DeleteManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[1].SecretKey = "A", "MISSING"

		// Action
		res, err := tn.Admin.API.DeleteManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "One or more secrets does not exist: MISSING", res.JSON404.Message)
		require.Equal(t, map[string]string{"A": "value"}, valuesOf(t, proj))
	})

	t.Run("should refuse the whole delete and keep every secret when one name is listed twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "value")
		secretmanager.CreateSecret(t, proj, "dev", "B", "value")
		body := api.DeleteManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 3)[:3]
		body.Secrets[0].SecretKey, body.Secrets[1].SecretKey, body.Secrets[2].SecretKey = "A", "B", "A"

		// Action
		res, err := tn.Admin.API.DeleteManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Each secret can only be deleted once per request: A", res.JSON400.Message)
		require.Equal(t, map[string]string{"A": "value", "B": "value"}, valuesOf(t, proj))
	})
}
