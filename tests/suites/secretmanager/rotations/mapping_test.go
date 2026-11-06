package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func remap(u, p string) api.UpdatePostgreSQLCredentialsRotationJSONRequestBody {
	var body api.UpdatePostgreSQLCredentialsRotationJSONRequestBody
	body.SecretsMapping = &struct {
		Password string `json:"password"`
		Username string `json:"username"`
	}{Password: p, Username: u}
	return body
}

func TestSecretRotation_MappedSecrets(t *testing.T) {
	t.Parallel()

	t.Run("should refuse setting a mapped secret by hand and keep the published value", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		e.newRotation(t)
		before := e.published(t, "/")
		path, value := "/", "hand-written"

		// Action
		res, err := e.tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), usernameKey, api.UpdateSecretV4JSONRequestBody{
			ProjectId: e.proj.ID, Environment: "dev", SecretPath: &path, SecretValue: &value,
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "Cannot update rotated secret")
		require.Equal(t, before, e.published(t, "/"))
	})

	t.Run("should rename the mapped secrets and keep their values when the mapping changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		before := e.published(t, "/")

		// Action
		res := r.update(t, remap("DB_USER", "DB_PASS"))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, map[string]string{"DB_USER": before.name, "DB_PASS": before.password}, e.secretsAt(t, "/"))
	})

	t.Run("should refuse a mapping onto an existing secret and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		secretmanager.CreateSecret(t, e.proj, "dev", "TAKEN", "someone else's")
		before := e.published(t, "/")

		// Action
		res := r.update(t, remap("TAKEN", passwordKey))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "TAKEN")
		require.Equal(t, map[string]string{usernameKey: before.name, passwordKey: before.password, "TAKEN": "someone else's"},
			e.secretsAt(t, "/"))
	})
}
