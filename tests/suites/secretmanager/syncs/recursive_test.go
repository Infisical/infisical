package syncs_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

const deniedSubfolder = `You do not have permission to read secrets at path "/backend/api" in environment "dev".`

func TestSecretSync_RecursivePermissions(t *testing.T) {
	t.Parallel()

	t.Run("should refuse and create nothing when subfolders include one the actor cannot read", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The sync worker reads every folder a sync covers with access checks off,
			so create is the only gate. A folder grant gives read on a parent while the base
			role denies the child.`)

		// Setup
		proj, conn, actor := deniedSubtree(t)

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"), includeSubFolders(), as(actor))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, deniedSubfolder, message(res.Body))
		require.Empty(t, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should refuse and keep the destination when the actor repoints a recursive sync over a subfolder they cannot read", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The administrator could read the whole subtree, so the sync is legitimate.
			Without this check an actor with Edit on the source alone sends the denied
			folder to a destination of their choosing.`)

		// Setup
		proj, conn, actor := deniedSubtree(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"), includeSubFolders())

		// Action
		res := s.update(t, actor.API, map[string]any{
			"destinationConfig": map[string]any{"scope": "repository", "owner": "acme", "repo": "actor-controlled"},
		})

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, deniedSubfolder, message(res.Body))
		require.Contains(t, string(s.get(t).Body), `"repo":"app"`)
	})

	t.Run("should refuse and keep subfolders off when the actor turns them on over a subfolder they cannot read", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, actor := deniedSubtree(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"))

		// Action
		res := s.update(t, actor.API, map[string]any{
			"syncOptions": map[string]any{"initialSyncBehavior": "overwrite-destination", "includeAllSubFolders": true},
		})

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, deniedSubfolder, message(res.Body))
		require.False(t, includesSubFolders(t, s))
	})
}

func TestSecretSync_RecursiveConflicts(t *testing.T) {
	t.Parallel()

	t.Run("should refuse and create nothing when two folders hold the same key, naming the key and both folders", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		duplicateUnder(t, proj, "/backend", "DB_URL")

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"), includeSubFolders())

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, message(res.Body), `"DB_URL" in /backend and /backend/child`)
		require.Empty(t, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should accept turning subfolders off although the subtree now holds a duplicate key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The checks an update runs read the options it is about to store. A request
			that carries syncOptions replaces them outright, so this one stores a sync
			without subfolders and has nothing to flatten.`)

		// Setup
		proj, conn, _ := setup(t)
		s := recursiveSyncWithLateDuplicate(t, proj, conn, "/reports")

		// Action
		res := s.update(t, proj.Tenant().Admin.API, map[string]any{
			"syncOptions": map[string]any{"initialSyncBehavior": "overwrite-destination"},
		})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "turning subfolders off returned %s", apierr.Body(res.Body))
		require.False(t, includesSubFolders(t, s))
	})

	t.Run("should refuse and keep the name when an update that leaves the options alone meets a duplicate key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `An update without syncOptions keeps the stored ones, so it is still checked
			as a sync that includes subfolders.`)

		// Setup
		proj, conn, _ := setup(t)
		s := recursiveSyncWithLateDuplicate(t, proj, conn, "/metrics")
		before := s.get(t).JSON200.SecretSync.Name

		// Action
		res := s.update(t, proj.Tenant().Admin.API, map[string]any{"name": "renamed"})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, message(res.Body), `"LATE_KEY" in /metrics and /metrics/child`)
		require.Equal(t, before, s.get(t).JSON200.SecretSync.Name)
	})

	t.Run("should refuse and keep subfolders off when turning them on meets a duplicate key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		duplicateUnder(t, proj, "/backend", "DB_URL")
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"))

		// Action
		res := s.update(t, proj.Tenant().Admin.API, map[string]any{
			"syncOptions": map[string]any{"initialSyncBehavior": "overwrite-destination", "includeAllSubFolders": true},
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, message(res.Body), `"DB_URL" in /backend and /backend/child`)
		require.False(t, includesSubFolders(t, s))
	})

	t.Run("should list every duplicate key with its folders from the conflict check", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, _, _ := setup(t)
		duplicateUnder(t, proj, "/backend", "DB_URL")
		for _, at := range []string{"/backend", "/backend/child"} {
			secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "v"+at, secretmanager.WithPath(at))
		}
		secretmanager.CreateSecret(t, proj, "dev", "UNIQUE_KEY", "v", secretmanager.WithPath("/backend"))

		// Action
		res, err := proj.Tenant().Admin.API.CheckGitHubSecretSyncRecursiveConflictsWithResponse(t.Context(),
			api.CheckGitHubSecretSyncRecursiveConflictsJSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretPath: "/backend"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "checking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := map[string][]string{}
		for _, c := range res.JSON200.Conflicts {
			got[c.Key] = c.Paths
		}
		require.Len(t, got, 2)
		require.ElementsMatch(t, []string{"/backend", "/backend/child"}, got["DB_URL"])
		require.ElementsMatch(t, []string{"/backend", "/backend/child"}, got["API_KEY"])
	})
}

func TestSecretSync_RecursiveTrigger(t *testing.T) {
	t.Parallel()

	t.Run("should push a secret written in a subfolder to the recursive sync above it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/backend"), includeSubFolders(), autoSync(true))
		s.awaitTerminal(t)

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "SUBFOLDER_KEY", "subfolder-value", secretmanager.WithPath("/backend/api"))

		// Assert
		gh.ExpectEvent[github.SecretCreated](t, created("SUBFOLDER_KEY"), syncBudget)
		require.Equal(t, "subfolder-value", gh.Repo(t, "acme/app").Secrets["SUBFOLDER_KEY"].Value)
	})

	t.Run("should remove a deleted subfolder's secrets from the recursive sync above it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `No secret-level write carries a folder delete, so the run has to be queued
			by the delete itself. The sync exists before the secret is written, so the only
			runs are the one for that write and the one for the delete. The delete waits for
			the write's run to record its sync time, and the final wait allows one 30 s lock
			requeue in case that run had not yet released its lock.`)

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateFolder(t, proj, "dev", "/audit/reports")
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromPath("/audit"), includeSubFolders(), autoSync(true))
		s.awaitTerminal(t)
		before := s.get(t).JSON200.SecretSync.LastSyncedAt
		secretmanager.CreateSecret(t, proj, "dev", "AUDIT_KEY", "audit-value", secretmanager.WithPath("/audit/reports"))
		gh.ExpectEvent[github.SecretCreated](t, created("AUDIT_KEY"), syncBudget)
		wait.Until(t, "the write's sync run to record its sync time", func() bool {
			got := s.get(t).JSON200.SecretSync.LastSyncedAt
			return got != nil && (before == nil || got.After(*before))
		})
		mark := gh.Mark(t)

		// Action
		deleteFolder(t, proj, "dev", "/audit/reports")

		// Assert
		gh.ExpectEvent[github.SecretDeleted](t, named("AUDIT_KEY"), fakenet.Since(mark), fakenet.Within(60*time.Second))
		require.NotContains(t, gh.Repo(t, "acme/app").Secrets, "AUDIT_KEY")
	})
}

// deniedSubtree is /backend and /backend/api, each holding a secret, and an actor
// whose base role grants nothing and whose folder grant is Manage on /backend only.
// Manage is the lowest tier that creates syncs, and a folder grant does not reach the
// folders below it.
func deniedSubtree(tt *testing.T) (*fixture.Project, *fixture.AppConnection, *harness.Principal) {
	tt.Helper()
	proj, conn, _ := setup(tt)
	secretmanager.CreateFolder(tt, proj, "dev", "/backend/api")
	secretmanager.CreateSecret(tt, proj, "dev", "BACKEND_KEY", "backend-value", secretmanager.WithPath("/backend"))
	secretmanager.CreateSecret(tt, proj, "dev", "API_KEY", "api-value", secretmanager.WithPath("/backend/api"))
	actor := proj.NewMachineIdentity(tt, fixture.WithRoles("no-access"))
	secretmanager.GrantFolderAccess(tt, proj, actor, secretmanager.Location{Env: "dev", Path: "/backend"}, secretmanager.FolderManage)
	return proj, conn, actor
}

// duplicateUnder writes the same key into a folder and its child folder.
func duplicateUnder(tt *testing.T, p *fixture.Project, folder, key string) {
	tt.Helper()
	secretmanager.CreateFolder(tt, p, "dev", folder+"/child")
	for _, at := range []string{folder, folder + "/child"} {
		secretmanager.CreateSecret(tt, p, "dev", key, "value-for-"+at, secretmanager.WithPath(at))
	}
}

// recursiveSyncWithLateDuplicate is a recursive sync whose subtree was clean when it
// was saved and has held a duplicate key since. A create over an existing duplicate is
// refused, so this is the only way a sync gets into that state.
func recursiveSyncWithLateDuplicate(tt *testing.T, p *fixture.Project, conn *fixture.AppConnection, folder string) *sync {
	tt.Helper()
	secretmanager.CreateFolder(tt, p, "dev", folder+"/child")
	s := newSync(tt, p, conn, repoScope("acme", "app"), fromPath(folder), includeSubFolders())
	for _, at := range []string{folder, folder + "/child"} {
		secretmanager.CreateSecret(tt, p, "dev", "LATE_KEY", "value-for-"+at, secretmanager.WithPath(at))
	}
	return s
}

func includesSubFolders(tt *testing.T, s *sync) bool {
	tt.Helper()
	v := s.get(tt).JSON200.SecretSync.SyncOptions.IncludeAllSubFolders
	return v != nil && *v
}
