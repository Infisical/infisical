package syncs_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Trigger(t *testing.T) {
	t.Parallel()

	t.Run("should refuse a manual trigger saying the folder no longer exists when the source folder is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/doomed")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "v", secretmanager.WithPath("/doomed"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/doomed"))
		deleteFolder(t, proj, "dev", "/doomed")

		// Action
		res, err := proj.Tenant().Admin.API.SyncGitHubSecretSyncWithResponse(t.Context(), s.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Invalid source configuration: folder no longer exists. Please configure a valid source and try again.",
			message(res.Body))
		require.Nil(t, s.get(t).JSON200.SecretSync.SyncStatus, "a sync with no source was queued")
	})

	t.Run("should push a secret created at the source when auto-sync is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), autoSync(true))
		s.awaitTerminal(t)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "NEW_KEY", "new-value")

		// Assert
		gh.ExpectEvent[github.SecretCreated](t, created("NEW_KEY"), syncBudget)
		require.Equal(t, "new-value", gh.Repo(t, "acme/app").Secrets["NEW_KEY"].Value)
	})

	t.Run("should not push a secret created at the source when auto-sync is off", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Absence needs a window that covers the delay a queued sync would have had.
			A second sync on the same folder with auto-sync on proves the write was seen;
			once it lands, any job queued at the same moment has at most 10 s of start
			jitter left.`)

		// Setup
		proj, conn, gh := setup(t)
		on := newSync(t, proj, conn, repoScope("acme", "on"), autoSync(true))
		on.awaitTerminal(t)
		newSync(t, proj, conn, repoScope("acme", "off"), autoSync(false))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "NEW_KEY", "new-value")

		// Assert
		gh.ExpectEvent[github.SecretCreated](t, createdIn("repos/acme/on", "NEW_KEY"), syncBudget)
		gh.ExpectNoEvent[github.SecretCreated](t, createdIn("repos/acme/off", "NEW_KEY"), fakenet.Within(11*time.Second))
	})

	t.Run("should send the source folder's secrets and not its child folders' when subfolders are off", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/services/api")
		secretmanager.CreateSecret(t, proj, "dev", "PARENT_KEY", "parent-value", secretmanager.WithPath("/services"))
		secretmanager.CreateSecret(t, proj, "dev", "CHILD_KEY", "child-value", secretmanager.WithPath("/services/api"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/services"))

		// Action
		s.trigger(t)

		// Assert
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, []string{"PARENT_KEY"}, keysOf(got))
		require.Equal(t, "parent-value", got["PARENT_KEY"].Value)
	})

	t.Run("should send imported and referenced secrets with their values resolved", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "SHARED_KEY", "shared-value")
		secretmanager.CreateFolder(t, proj, "dev", "/services")
		secretmanager.CreateSecret(t, proj, "dev", "OWN_KEY", "own-value", secretmanager.WithPath("/services"))
		secretmanager.CreateSecret(t, proj, "dev", "REF_KEY", "${OWN_KEY}+${dev.SHARED_KEY}", secretmanager.WithPath("/services"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/"}, secretmanager.IntoPath("/services"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/services"))

		// Action
		s.trigger(t)

		// Assert
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, []string{"OWN_KEY", "REF_KEY", "SHARED_KEY"}, keysOf(got))
		require.Equal(t, "shared-value", got["SHARED_KEY"].Value)
		require.Equal(t, "own-value+shared-value", got["REF_KEY"].Value)
	})

	t.Run("should name keys by the schema with the source environment filled in and keep keys outside it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED_KEY", "not ours"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newSync(t, proj, conn, repoScope("acme", "app"), keySchema("INFISICAL_{{environment}}_{{secretKey}}"))

		// Action
		s.trigger(t)

		// Assert
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, []string{"INFISICAL_DEV_API_KEY", "UNMANAGED_KEY"}, keysOf(got))
		require.Equal(t, "api-value", got["INFISICAL_DEV_API_KEY"].Value)
		require.Equal(t, "not ours", got["UNMANAGED_KEY"].Value)
	})

	t.Run("should remove destination secrets Infisical does not have on the first overwrite", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "STALE_KEY", "stale-value"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		// Action
		s.trigger(t)

		// Assert
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, []string{"API_KEY"}, keysOf(got))
		require.Equal(t, "api-value", got["API_KEY"].Value)
	})

	t.Run("should push to a sync whose folder imports the folder where a secret changed", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The change reaches the importing folder's sync through the integration
			sync job, a second queue hop after the folder's own debounce.`)

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/a")
		secretmanager.CreateFolder(t, proj, "dev", "/b")
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/a"), autoSync(true))
		s.awaitTerminal(t)
		before := s.get(t).JSON200.SecretSync.LastSyncedAt
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/b"}, secretmanager.IntoPath("/a"))
		wait.Until(t, "the sync run that creating the import queues", func() bool {
			got := s.get(t).JSON200.SecretSync.LastSyncedAt
			return got != nil && (before == nil || got.After(*before))
		})
		mark := gh.Mark(t)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "LATE_KEY", "late-value", secretmanager.WithPath("/b"))

		// Assert
		gh.ExpectEvent[github.SecretCreated](t, created("LATE_KEY"), syncBudget, fakenet.Since(mark))
		require.Equal(t, "late-value", gh.Repo(t, "acme/app").Secrets["LATE_KEY"].Value)
	})
}
