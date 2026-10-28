package syncs_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
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
