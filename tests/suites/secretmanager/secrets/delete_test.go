package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecret_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should no longer list or return a secret once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "GONE", "value")
		secretmanager.CreateSecret(t, proj, "dev", "KEPT", "value")

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "GONE")

		// Assert
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "GONE",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		secrets := secretmanager.ListSecrets(t, proj, "dev")
		require.Len(t, secrets, 1)
		require.Equal(t, "KEPT", secrets[0].Key)
	})

	t.Run("should return not found when the secret does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.DeleteSecretV4WithResponse(t.Context(), "NOPE",
			api.DeleteSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Secret not found", res.JSON404.Message)
	})

	t.Run("should refuse and keep the secret when the actor is a project viewer", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "original")

		// Action
		res, err := viewer.API.DeleteSecretV4WithResponse(t.Context(), "API_KEY",
			api.DeleteSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to delete on secrets", res.JSON403.Message)
		require.Equal(t, "original", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should return the deleted secret's value in the delete response", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "last-copy")

		// Action
		res, err := tn.Admin.API.DeleteSecretV4WithResponse(t.Context(), "API_KEY",
			api.DeleteSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Assert
		deleted, err := res.JSON200.AsDeleteSecretV4200JSONResponseBody0()
		require.NoError(t, err)
		require.Equal(t, "last-copy", deleted.Secret.SecretValue)
		require.False(t, deleted.Secret.SecretValueHidden)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should hide the value in the delete response when the actor cannot read values", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "blind-deleter", fixture.Permission{Subject: "secrets", Action: []string{"describeSecret", "delete"}})
		deleter := proj.NewMachineIdentity(t, fixture.WithRoles("blind-deleter"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "last-copy")

		// Action
		res, err := deleter.API.DeleteSecretV4WithResponse(t.Context(), "API_KEY",
			api.DeleteSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Assert
		deleted, err := res.JSON200.AsDeleteSecretV4200JSONResponseBody0()
		require.NoError(t, err)
		require.True(t, deleted.Secret.SecretValueHidden)
		require.NotContains(t, string(res.Body), "last-copy")
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})
}
