package syncs_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should leave the destination secrets in place when a sync is deleted without removing them", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "1")
		s.trigger(t)
		mark := gh.Mark(t)

		// Action
		res := s.delete(t, proj.Tenant().Admin.API, false)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		gh.ExpectNoEvent[github.SecretDeleted](t, nil, fakenet.Since(mark))
		require.Equal(t, "1", gh.Repo(t, "acme/app").Secrets["KEEP"].Value)
		s.awaitGone(t)
	})

	t.Run("should remove the synced secrets and then the sync when the delete removes secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "not ours"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), disableSecretDeletion())
		secretmanager.CreateSecret(t, proj, "dev", "MANAGED", "1")
		s.trigger(t)

		// Action
		s.deleteRemovingSecrets(t)

		// Assert
		gh.ExpectEvent[github.SecretDeleted](t, named("MANAGED"), syncBudget)
		s.awaitGone(t)
		got := gh.Repo(t, "acme/app").Secrets
		require.NotContains(t, got, "MANAGED")
		require.Equal(t, "not ours", got["UNMANAGED"].Value)
	})

	t.Run("should keep the sync with the provider's reason when removing its secrets on delete fails", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "MANAGED", "1")
		s.trigger(t)
		gh.Fail(t, "DELETE", "/repos/acme/app/actions/secrets/*", http.StatusForbidden,
			fakenet.Body(`{"message":"Resource not accessible by personal access token"}`))

		// Action
		s.deleteRemovingSecrets(t)

		// Assert
		got := s.awaitRemoveOutcome(t)
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "Resource not accessible by personal access token")
		require.Equal(t, "1", gh.Repo(t, "acme/app").Secrets["MANAGED"].Value)
	})

	t.Run("should cut the provider's message to 1024 characters when a remove fails with a long one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "MANAGED", "1")
		s.trigger(t)
		gh.Fail(t, "DELETE", "/repos/acme/app/actions/secrets/*", http.StatusUnprocessableEntity,
			fakenet.Body(fmt.Sprintf(`{"message":"%s"}`, strings.Repeat("x", 2000))))

		// Action
		s.removeSecrets(t)

		// Assert
		got := s.awaitRemoveOutcome(t)
		require.Equal(t, "failed", got.status)
		require.Len(t, got.message, 1024)
		require.True(t, strings.HasSuffix(got.message, "..."), "the cut message does not say it was cut: %s", got.message)
	})

	t.Run("should clear only the synced keys from the destination and leave Infisical unchanged on remove-secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "not ours"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), disableSecretDeletion())
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s.trigger(t)

		// Action
		s.removeSecrets(t)

		// Assert
		got := s.awaitRemoveOutcome(t)
		require.Equalf(t, "succeeded", got.status, "the remove failed: %s", got.message)
		dest := gh.Repo(t, "acme/app").Secrets
		require.NotContains(t, dest, "API_KEY")
		require.Equal(t, "not ours", dest["UNMANAGED"].Value)
		require.Equal(t, "api-value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})
}
