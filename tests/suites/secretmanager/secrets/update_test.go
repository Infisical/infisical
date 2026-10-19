package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the new value and move to version 2", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "old")

		// Action
		updated := secretmanager.UpdateSecret(t, proj, "dev", "API_KEY", "new")

		// Assert
		require.EqualValues(t, 2, updated.Version)
		require.Equal(t, "new", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should move the value to the new name and free the old one when renamed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "OLD_NAME", "value")

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "OLD_NAME",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", NewSecretName: new("NEW_NAME")})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "renaming returned %s", res.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "NEW_NAME").Value)
		secrets := secretmanager.ListSecrets(t, proj, "dev")
		require.Len(t, secrets, 1)
		require.Equal(t, "NEW_NAME", secrets[0].Key)
	})

	t.Run("should refuse a rename onto an existing name and keep both secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FIRST", "one")
		secretmanager.CreateSecret(t, proj, "dev", "SECOND", "two")

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "FIRST",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", NewSecretName: new("SECOND")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret with the new name already exists", res.JSON400.Message)
		require.Equal(t, "one", secretmanager.GetSecret(t, proj, "dev", "FIRST").Value)
		require.Equal(t, "two", secretmanager.GetSecret(t, proj, "dev", "SECOND").Value)
	})

	t.Run("should replace the tags and keep the value when only tags are sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		oldTag, newTagID := newTag(t, proj, "old-tag"), newTag(t, proj, "new-tag")
		_, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "TAGGED",
			api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "value", TagIds: &[]string{oldTag}})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "TAGGED",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", TagIds: &[]string{newTagID}})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "retagging returned %s", res.Body)

		// Assert
		got, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "TAGGED",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading returned %d: %s", got.StatusCode(), got.Body)
		require.Equal(t, "value", got.JSON200.Secret.SecretValue)
		require.NotNil(t, got.JSON200.Secret.Tags)
		require.Len(t, *got.JSON200.Secret.Tags, 1)
		require.Equal(t, "new-tag", (*got.JSON200.Secret.Tags)[0].Slug)
	})

	t.Run("should return not found and create nothing when the secret does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "NOPE",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: new("value")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Secret with name NOPE not found", res.JSON404.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse and keep the value when the actor is a project viewer", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "original")

		// Action
		res, err := viewer.API.UpdateSecretV4WithResponse(t.Context(), "API_KEY",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: new("changed")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to edit on secrets", res.JSON403.Message)
		require.Equal(t, "original", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})
}
