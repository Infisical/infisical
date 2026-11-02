package permissions_test

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

func TestRole_ConditionalWrites(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should allow a create only in the permitted path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/allowed")
		secretmanager.CreateFolder(t, proj, "dev", "/other")
		proj.NewRole(t, "writer", allowWhere("secrets", map[string]any{"secretPath": "/allowed"}, "read", "create"))
		writer := proj.NewMachineIdentity(t, fixture.WithRoles("writer"))

		// Action
		inside := createSecret(t, writer, proj, "dev", "/allowed", "KEY", "v")
		outside := createSecret(t, writer, proj, "dev", "/other", "KEY", "v")

		// Assert
		require.Equalf(t, http.StatusOK, inside.StatusCode(), "creating in /allowed: %s", inside.Body)
		require.Equalf(t, http.StatusForbidden, outside.StatusCode(), "creating in /other: %s", outside.Body)
		require.Empty(t, secretsAt(t, proj, "dev", "/other"))
		require.Equal(t, map[string]string{"KEY": "v"}, secretsAt(t, proj, "dev", "/allowed"))
	})

	t.Run("should refuse a rename onto a denied name and keep the old name", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "DEV_KEY", "v")
		proj.NewRole(t, "no-prod-names",
			allow("secrets", "read", "create", "edit"),
			deny(allowWhere("secrets", map[string]any{"secretName": map[string]any{"$glob": "PROD_*"}}, "edit")))
		editor := proj.NewMachineIdentity(t, fixture.WithRoles("no-prod-names"))

		// Action
		res := updateSecret(t, editor, proj, "dev", "/", "DEV_KEY", api.UpdateSecretV4JSONRequestBody{NewSecretName: new("PROD_KEY")})

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "renaming: %s", res.Body)
		require.Equal(t, map[string]string{"DEV_KEY": "v"}, secretsAt(t, proj, "dev", "/"))
		require.Equal(t, http.StatusOK, updateSecret(t, editor, proj, "dev", "/", "DEV_KEY",
			api.UpdateSecretV4JSONRequestBody{NewSecretName: new("STAGING_KEY")}).StatusCode(), "a rename onto an allowed name")
	})

	t.Run("should check the new tag set and refuse an update that adds a denied tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		restricted := secretmanager.CreateTag(t, proj, "restricted")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "v")
		proj.NewRole(t, "no-restricted",
			allow("secrets", "read", "edit"),
			deny(allowWhere("secrets", map[string]any{"secretTags": map[string]any{"$in": []string{"restricted"}}}, "edit")))
		editor := proj.NewMachineIdentity(t, fixture.WithRoles("no-restricted"))

		// Action
		res := updateSecret(t, editor, proj, "dev", "/", "API_KEY", api.UpdateSecretV4JSONRequestBody{
			SecretValue: new("changed"),
			TagIds:      &[]string{restricted},
		})

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "tagging: %s", res.Body)
		stored := readSecret(t, proj.Tenant().Admin, proj, "dev", "/", "API_KEY")
		require.NotNil(t, stored.JSON200)
		require.Equal(t, "v", stored.JSON200.Secret.SecretValue)
		require.Empty(t, stored.JSON200.Secret.Tags)
		require.Equal(t, http.StatusOK, updateSecret(t, editor, proj, "dev", "/", "API_KEY",
			api.UpdateSecretV4JSONRequestBody{SecretValue: new("changed")}).StatusCode(), "the same update without the tag")
	})

	t.Run("should refuse the whole batch when one item is outside the permitted path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/allowed")
		secretmanager.CreateFolder(t, proj, "dev", "/denied")
		secretmanager.CreateSecret(t, proj, "dev", "IN", "old", secretmanager.WithPath("/allowed"))
		secretmanager.CreateSecret(t, proj, "dev", "OUT", "old", secretmanager.WithPath("/denied"))
		proj.NewRole(t, "allowed-editor", allowWhere("secrets", map[string]any{"secretPath": "/allowed"}, "read", "edit"))
		editor := proj.NewMachineIdentity(t, fixture.WithRoles("allowed-editor"))
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretPath, body.Secrets[0].SecretValue = "IN", new("/allowed"), new("new")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretPath, body.Secrets[1].SecretValue = "OUT", new("/denied"), new("new")

		// Action
		res, err := editor.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "batch update: %s", res.Body)
		require.Equal(t, map[string]string{"IN": "old"}, secretsAt(t, proj, "dev", "/allowed"))
		require.Equal(t, map[string]string{"OUT": "old"}, secretsAt(t, proj, "dev", "/denied"))
	})
}
