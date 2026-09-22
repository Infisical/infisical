package syncs_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/fixture/project"
	"github.com/Infisical/infisical/tests/fixture/secret"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
)

// setup is the arrangement every subtest starts from: a project, a GitHub connection,
// and a handle on the GitHub account that connection addresses.
func setup(t *testing.T) (*project.Project, *appconnection.Connection, *github.Handle) {
	t.Helper()

	tn := harness.From(t).NewTenant(t)
	proj := project.New(t, tn, project.WithType("secret-manager"))
	conn := appconnection.New(t, tn, provider.GitHub)
	return proj, conn, github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
}

func TestGitHubSync_SyncSecrets(t *testing.T) {
	t.Parallel()

	t.Run("ok/a secret reaches the destination with its value intact", func(t *testing.T) {
		t.Parallel()

		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		secret.Create(t, proj, "dev", "DB_URL", "postgres://db/app")
		s.trigger(t)

		got := gh.Repo(t, "acme/app").Secrets
		if got["DB_URL"].Value != "postgres://db/app" {
			t.Errorf("GitHub holds %q for DB_URL, want postgres://db/app", got["DB_URL"].Value)
		}
	})

	t.Run("ok/a secret removed in Infisical is pruned at the destination", func(t *testing.T) {
		t.Parallel()

		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		secret.Create(t, proj, "dev", "KEEP", "1")
		secret.Create(t, proj, "dev", "DROP", "2")
		s.trigger(t)

		secret.Delete(t, proj, "dev", "DROP")
		s.trigger(t)

		got := gh.Repo(t, "acme/app").Secrets
		if got["KEEP"].Value != "1" {
			t.Errorf("KEEP holds %q, want 1", got["KEEP"].Value)
		}
		if _, still := got["DROP"]; still {
			t.Error("DROP was deleted in Infisical but is still at the destination")
		}
	})

	t.Run("ok/a secret outside the key schema is left alone", func(t *testing.T) {
		t.Parallel()

		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "SOMEONE_ELSES", "do not touch"))

		s := newSync(t, proj, conn, repoScope("acme", "app"), keySchema("INFISICAL_{{secretKey}}"))

		secret.Create(t, proj, "dev", "A", "1")
		s.trigger(t)

		got := gh.Repo(t, "acme/app").Secrets
		if got["SOMEONE_ELSES"].Value != "do not touch" {
			t.Errorf("a secret outside the key schema was modified or deleted: %#v", got["SOMEONE_ELSES"])
		}
		if _, ok := got["INFISICAL_A"]; !ok {
			t.Errorf("the managed secret did not arrive under the key schema: %v", keys(got))
		}
	})

	t.Run("ok/disableSecretDeletion keeps an orphan at the destination", func(t *testing.T) {
		t.Parallel()

		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), disableSecretDeletion())

		secret.Create(t, proj, "dev", "ORPHAN", "1")
		s.trigger(t)

		secret.Delete(t, proj, "dev", "ORPHAN")
		s.trigger(t)

		if got := gh.Repo(t, "acme/app").Secrets; got["ORPHAN"].Value != "1" {
			t.Errorf("ORPHAN was pruned despite disableSecretDeletion: %#v", got["ORPHAN"])
		}
	})

	t.Run("ok/keys are upper-cased on the way out", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `syncSecrets upper-cases every key before sending it, because GitHub
			does. A test asserting on the request path would pass either way; only the
			destination's own key set shows which name it was actually stored under.`)

		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		secret.Create(t, proj, "dev", "lower_case", "v")
		s.trigger(t)

		got := gh.Repo(t, "acme/app").Secrets
		if _, ok := got["LOWER_CASE"]; !ok {
			t.Errorf("secret was not stored upper-cased: %v", keys(got))
		}
	})

	t.Run("ok/a sync spanning several pages sends every secret", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The client asks for 100 per page, reads the Link header, parses
			rel="last" for a page count and fetches the rest concurrently. A destination
			that answered everything on one page would leave that loop untested, and it is
			the loop that decides what gets pruned. Organization scope because the
			repository cap is 100, which is one page.`)

		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, orgScope("acme"))

		const n = 120
		for i := range n {
			secret.Create(t, proj, "dev", fmt.Sprintf("BULK_%03d", i), fmt.Sprintf("v%d", i))
		}
		s.trigger(t)

		// Again, so the run has to list what is already there. That is the call that
		// paginates, and its result is what the prune decision is built from.
		s.trigger(t)

		if got := gh.OrgSecrets(t, "acme").Secrets; len(got) != n {
			t.Errorf("the destination holds %d secrets, want %d", len(got), n)
		}
	})

	t.Run("invalid/more than 100 secrets at repository scope is refused", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `GitHub caps repository secrets at 100 and Infisical checks before
			sending anything, so the sync fails with a message naming the limit rather than
			writing 100 and silently dropping the rest. Found by writing the pagination
			test above against the wrong scope.`)

		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))

		for i := range 101 {
			secret.Create(t, proj, "dev", fmt.Sprintf("BULK_%03d", i), "v")
		}

		status, message := s.triggerExpectingFailure(t)
		if status != "failed" {
			t.Fatalf("a sync of 101 secrets to a repository reported %q, want failed", status)
		}
		if !strings.Contains(message, "100") {
			t.Errorf("the failure does not name the limit, so nobody can act on it: %s", message)
		}
	})
}

func TestGitHubSync_Create(t *testing.T) {
	t.Parallel()

	t.Run("ok/creating a sync with auto-sync on pushes immediately", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `isAutoSyncEnabled defaults to true and queues a sync at creation, so
			a secret that already exists arrives without anyone triggering anything.`)

		proj, conn, gh := setup(t)
		secret.Create(t, proj, "dev", "PRESENT", "1")

		s := newSync(t, proj, conn, repoScope("acme", "app"), autoSync(true))
		s.awaitTerminal(t)

		if got := gh.Repo(t, "acme/app").Secrets; got["PRESENT"].Value != "1" {
			t.Errorf("auto-sync did not push an existing secret: %#v", got)
		}
	})

	t.Run("ok/creating a sync with auto-sync off leaves the destination untouched", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The inverse, and the one a response body cannot show: proving a write
			did not happen needs somewhere to look that would have recorded it.`)

		proj, conn, gh := setup(t)
		secret.Create(t, proj, "dev", "PRESENT", "1")

		newSync(t, proj, conn, repoScope("acme", "app"), autoSync(false))

		if store := gh.Repo(t, "acme/app"); store != nil && len(store.Secrets) > 0 {
			t.Errorf("a sync created with auto-sync off wrote to the destination: %v", keys(store.Secrets))
		}
	})
}

func keys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
