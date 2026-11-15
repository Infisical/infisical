package servicetokens_test

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

func TestServiceToken_Scope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	readWrite := []string{"read", "write"}
	everywhereInDev := []tokenScope{{Environment: "dev", SecretPath: "/**"}}

	for _, at := range []struct{ name, path string }{{"at the root", "/"}, {"in a nested folder", "/nested1/nested2/folder"}} {
		t.Run("should create a secret it can read back "+at.name+" when its glob scope covers the path", func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
			if at.path != "/" {
				secretmanager.CreateFolder(t, proj, "dev", at.path)
			}
			token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})

			// Action
			created := createSecret(t, token, proj, "dev", at.path, "ST_SEC", "something-secret")

			// Assert
			requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
			listed := listSecrets(t, token, proj, "dev", at.path)
			requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
			require.Equal(t, []string{"ST_SEC"}, keysOf(listed))
			require.Equal(t, map[string]string{"ST_SEC": "something-secret"}, valuesAt(t, proj, at.path))
		})

		t.Run("should update a secret "+at.name+" when its glob scope covers the path", func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
			if at.path != "/" {
				secretmanager.CreateFolder(t, proj, "dev", at.path)
			}
			secretmanager.CreateSecret(t, proj, "dev", "ST_SEC", "old", secretmanager.WithPath(at.path))
			token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})

			// Action
			res, err := token.UpdateSecretV4WithResponse(t.Context(), "ST_SEC", api.UpdateSecretV4JSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", SecretPath: &at.path, SecretValue: new("new-value"),
			})

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			require.Equal(t, map[string]string{"ST_SEC": "new-value"}, valuesAt(t, proj, at.path))
		})

		t.Run("should delete a secret "+at.name+" when its glob scope covers the path", func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
			if at.path != "/" {
				secretmanager.CreateFolder(t, proj, "dev", at.path)
			}
			secretmanager.CreateSecret(t, proj, "dev", "ST_SEC", "value", secretmanager.WithPath(at.path))
			token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})

			// Action
			res, err := token.DeleteSecretV4WithResponse(t.Context(), "ST_SEC", api.DeleteSecretV4JSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", SecretPath: &at.path,
			})

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			require.Empty(t, valuesAt(t, proj, at.path))
		})
	}

	bulkKeys := []string{"BULK_1", "BULK_2", "BULK_3", "BULK_4", "BULK_5"}

	t.Run("should create secrets in bulk inside its scope", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/nested1/nested2/folder")
		token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretPath: new("/nested1/nested2/folder")}
		body.Secrets = slices.Grow(body.Secrets, len(bulkKeys))[:len(bulkKeys)]
		for i, key := range bulkKeys {
			body.Secrets[i].SecretKey, body.Secrets[i].SecretValue = key, "value"
		}

		// Action
		res, err := token.CreateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		want := map[string]string{}
		for _, key := range bulkKeys {
			want[key] = "value"
		}
		require.Equal(t, want, valuesAt(t, proj, "/nested1/nested2/folder"))
	})

	t.Run("should update secrets in bulk inside its scope", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		for _, key := range bulkKeys {
			secretmanager.CreateSecret(t, proj, "dev", key, "old")
		}
		token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, len(bulkKeys))[:len(bulkKeys)]
		for i, key := range bulkKeys {
			body.Secrets[i].SecretKey, body.Secrets[i].SecretValue = key, new("update-value")
		}

		// Action
		res, err := token.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		want := map[string]string{}
		for _, key := range bulkKeys {
			want[key] = "update-value"
		}
		require.Equal(t, want, valuesAt(t, proj, "/"))
	})

	t.Run("should delete secrets in bulk inside its scope", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		for _, key := range bulkKeys {
			secretmanager.CreateSecret(t, proj, "dev", key, "value")
		}
		token := newServiceToken(t, proj, tokenOptions{scopes: everywhereInDev, permissions: readWrite})
		body := api.DeleteManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, len(bulkKeys))[:len(bulkKeys)]
		for i, key := range bulkKeys {
			body.Secrets[i].SecretKey = key
		}

		// Action
		res, err := token.DeleteManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, valuesAt(t, proj, "/"))
	})

	// Glob scopes, because a token with one exact scope reads that scope whatever the
	// request names; see the next test.
	outside := []struct {
		name, env, path string
		scope           tokenScope
	}{
		{"a path", "dev", "/nested/deep", tokenScope{Environment: "dev", SecretPath: "/app/**"}},
		{"an environment", "prod", "/", tokenScope{Environment: "dev", SecretPath: "/**"}},
	}
	for _, out := range outside {
		t.Run("should refuse a secret in "+out.name+" outside its scope and reveal nothing", func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
			if out.path != "/" {
				secretmanager.CreateFolder(t, proj, out.env, out.path)
			}
			secretmanager.CreateSecret(t, proj, out.env, "HIDDEN", "value", secretmanager.WithPath(out.path))
			token := newServiceToken(t, proj, tokenOptions{scopes: []tokenScope{out.scope}, permissions: readWrite})

			// Action
			res, err := token.GetSecretByNameV4WithResponse(t.Context(), "HIDDEN", &api.GetSecretByNameV4Params{
				ProjectId: proj.ID, Environment: &out.env, SecretPath: &out.path,
			})

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
			require.Equal(t, "PermissionDenied", res.JSON403.Error)
			require.NotContains(t, keysOf(listSecrets(t, token, proj, out.env, out.path)), "HIDDEN")
			created := createSecret(t, token, proj, out.env, out.path, "NEW", "value")
			require.Equal(t, http.StatusForbidden, created.StatusCode())
			got := map[string]string{}
			for _, s := range secretmanager.ListSecrets(t, proj, out.env, secretmanager.WithPath(out.path)) {
				got[s.Key] = s.Value
			}
			require.Equal(t, map[string]string{"HIDDEN": "value"}, got)
		})
	}

	t.Run("should read its own scope instead of the requested environment when it has one exact scope", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "DEV_ONLY", "value")
		secretmanager.CreateSecret(t, proj, "prod", "PROD_ONLY", "value")
		token := newServiceToken(t, proj, tokenOptions{scopes: []tokenScope{{Environment: "dev", SecretPath: "/"}}, permissions: readWrite})

		// Action
		res := listSecrets(t, token, proj, "prod", "/")

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []string{"DEV_ONLY"}, keysOf(res))
	})

	t.Run("should refuse a write with a read-only token and still allow reads", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		token := newServiceToken(t, proj, tokenOptions{scopes: []tokenScope{{Environment: "dev", SecretPath: "/"}}, permissions: []string{"read"}})

		// Action
		created := createSecret(t, token, proj, "dev", "/", "NEW", "value")

		// Assert
		require.Equal(t, http.StatusForbidden, created.StatusCode())
		require.Equal(t, "PermissionDenied", created.JSON403.Error)
		require.Equal(t, map[string]string{"EXISTING": "value"}, valuesAt(t, proj, "/"))
		listed := listSecrets(t, token, proj, "dev", "/")
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Equal(t, []string{"EXISTING"}, keysOf(listed))
	})
}

func TestServiceToken_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a service token wider than the creator's own access and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "dev-token-maker",
			fixture.Permission{Subject: "service-tokens", Action: []string{"read", "create"}},
			fixture.Permission{
				Subject:    "secrets",
				Action:     []string{"read", "create", "edit", "delete"},
				Conditions: map[string]any{"environment": "dev"},
			})
		creator := proj.NewUser(t, fixture.WithRoles("dev-token-maker"))

		// Action
		res := requestServiceToken(t, creator, proj, tokenOptions{
			scopes:      []tokenScope{{Environment: "prod", SecretPath: "/"}},
			permissions: []string{"read", "write"},
		})

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Zero(t, serviceTokenCount(t, proj))
	})

	t.Run("should refuse an expired service token and delete it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		token := newServiceToken(t, proj, tokenOptions{
			scopes:      []tokenScope{{Environment: "dev", SecretPath: "/"}},
			permissions: []string{"read"},
			expiresIn:   new(1),
		})

		// Action
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) {
			res := listSecrets(t, token, proj, "dev", "/")
			return res.StatusCode(), res.Body
		})

		// Assert
		require.Contains(t, string(body), "Service token has expired")
		require.Zero(t, serviceTokenCount(t, proj))
	})
}
