package syncs_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Import(t *testing.T) {
	t.Parallel()

	t.Run("should refuse an import naming GitHub's limitation and start no job", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		// Action
		res, err := proj.Tenant().Admin.API.ImportGitHubSecretSyncSecretsWithResponse(t.Context(), s.ID,
			&api.ImportGitHubSecretSyncSecretsParams{ImportBehavior: api.ImportGitHubSecretSyncSecretsParamsImportBehaviorPrioritizeSource})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "GitHub does not support importing secrets.", message(res.Body))
		require.Nil(t, s.get(t).JSON200.SecretSync.ImportStatus)
	})
}

func TestSecretSync_ImportSecrets(t *testing.T) {
	t.Parallel()

	t.Run("should create secrets the source path does not have", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/DESTINATION_KEY", "destination-value"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		got := s.importSecrets(t, "prioritize-source")

		// Assert
		require.Equalf(t, "succeeded", got.status, "the import failed: %s", got.message)
		require.Equal(t, map[string]string{"DESTINATION_KEY": "destination-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should keep the Infisical value when the import prioritizes the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "infisical-value")
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "destination-value"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		got := s.importSecrets(t, "prioritize-source")

		// Assert
		require.Equalf(t, "succeeded", got.status, "the import failed: %s", got.message)
		require.Equal(t, map[string]string{"API_KEY": "infisical-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should overwrite the Infisical value when the import prioritizes the destination", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "infisical-value")
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "destination-value"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		got := s.importSecrets(t, "prioritize-destination")

		// Assert
		require.Equalf(t, "succeeded", got.status, "the import failed: %s", got.message)
		require.Equal(t, map[string]string{"API_KEY": "destination-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should keep the Infisical value when the destination holds the key empty", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Parameter Store refuses empty values, so the empty value comes from a key
			inside a many-to-one Secrets Manager document.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "infisical-value")
		cp.Seed(t, aws.SeedSecret("bundle", `{"API_KEY":"","NEW_KEY":"new-value"}`))
		s := newAWSSync(t, proj, conn, manyToOne("bundle"))

		// Action
		got := s.importSecrets(t, "prioritize-destination")

		// Assert
		require.Equalf(t, "succeeded", got.status, "the import failed: %s", got.message)
		require.Equal(t, map[string]string{"API_KEY": "infisical-value", "NEW_KEY": "new-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should fail naming the rule and import nothing when a destination key is not a valid secret name", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Secrets Manager allows a slash in a name and Infisical does not, so the
			invalid name comes from there.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedSecret("team/API_KEY", "destination-value"), aws.SeedSecret("VALID_KEY", "valid-value"))
		s := newAWSSync(t, proj, conn, oneToOne())

		// Action
		got := s.importSecrets(t, "prioritize-source")

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "Found 1 invalid secret name")
		require.Contains(t, got.message, "cannot contain colon or forward slash")
		require.Empty(t, secretsAt(t, proj, "/"))
	})
}
