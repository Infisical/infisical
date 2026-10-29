package syncs_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// setup returns a project, a GitHub connection, and a handle on the account it uses.
func setup(t *testing.T) (*fixture.Project, *fixture.AppConnection, *github.ControlPlane) {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
	return proj, conn, github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
}

func named(name string) func(github.SecretDeleted) bool {
	return func(e github.SecretDeleted) bool { return e.SecretName == name }
}

func TestGitHubSync_SyncSecrets(t *testing.T) {
	t.Parallel()

	t.Run("should deliver the value intact when a secret is synced", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "postgres://db/app")

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, "postgres://db/app", gh.Repo(t, "acme/app").Secrets["DB_URL"].Value)
	})

	t.Run("should prune the destination when a synced secret is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "1")
		secretmanager.CreateSecret(t, proj, "dev", "DROP", "2")
		s.trigger(t)
		mark := gh.Mark(t)

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "DROP")
		s.trigger(t)

		// Assert
		gh.ExpectEvent[github.SecretDeleted](t, named("DROP"), fakenet.Since(mark))
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, "1", got["KEEP"].Value)
		require.NotContains(t, got, "DROP")
	})

	t.Run("should leave a secret it does not own untouched when a key schema is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		gh.Seed(t, github.RepoSecret("acme/app", "SOMEONE_ELSES", "do not touch"))
		s := newSync(t, proj, conn, repoScope("acme", "app"), keySchema("INFISICAL_{{secretKey}}"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")

		// Action
		s.trigger(t)

		// Assert
		got := gh.Repo(t, "acme/app").Secrets
		require.Equal(t, "do not touch", got["SOMEONE_ELSES"].Value, "a secret outside the key schema was changed")
		require.Contains(t, got, "INFISICAL_A", "the managed secret did not arrive under the key schema")
	})

	t.Run("should keep a deleted secret at the destination when deletion is disabled", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"), disableSecretDeletion())
		secretmanager.CreateSecret(t, proj, "dev", "ORPHAN", "1")
		s.trigger(t)

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "ORPHAN")
		s.trigger(t)

		// Assert
		require.Equal(t, "1", gh.Repo(t, "acme/app").Secrets["ORPHAN"].Value)
	})

	t.Run("should store the key upper-cased when it is lower-case in Infisical", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A test on the request path would pass either way; only the
			destination's key set shows the name it was stored under.`)

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		secretmanager.CreateSecret(t, proj, "dev", "lower_case", "v")

		// Action
		s.trigger(t)

		// Assert
		require.Contains(t, gh.Repo(t, "acme/app").Secrets, "LOWER_CASE")
	})

	t.Run("should deliver every secret when they span several pages", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The client reads the Link header and fetches pages 2..N concurrently;
			that listing is what the prune decision is built from. Organization scope
			because the repository cap of 100 is a single page.`)

		// Setup
		proj, conn, gh := setup(t)
		s := newSync(t, proj, conn, orgScope("acme"))
		const n = 120
		for i := range n {
			secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("BULK_%03d", i), fmt.Sprintf("v%d", i))
		}
		s.trigger(t)

		// Action: the second run has to list what is already there, which paginates.
		s.trigger(t)

		// Assert
		require.Len(t, gh.OrgSecrets(t, "acme").Secrets, n)
	})

	t.Run("should deliver to Dependabot secrets and leave Actions secrets alone when the type is Dependabot", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		dependabot := api.CreateGitHubSecretSyncJSONBodyDestinationConfig1SecretTypeDependabot
		s := newSync(t, proj, conn, func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
			var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
			require.NoError(tt, d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig1(
				api.CreateGitHubSecretSyncJSONBodyDestinationConfig1{
					Owner: "acme", Repo: "app", Scope: "repository", SecretType: &dependabot,
				}))
			return d
		})
		secretmanager.CreateSecret(t, proj, "dev", "NPM_TOKEN", "npm_abc")

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, "npm_abc", gh.RepoOfType(t, "acme/app", github.Dependabot).Secrets["NPM_TOKEN"].Value)
		require.Nil(t, gh.Repo(t, "acme/app"), "a Dependabot sync touched the repository's Actions secrets")
	})

	t.Run("should share a Codespaces secret with only the selected repositories when visibility is selected", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		codespaces := api.CreateGitHubSecretSyncJSONBodyDestinationConfig0SecretTypeCodespaces
		s := newSync(t, proj, conn, func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
			var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
			require.NoError(tt, d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig0(
				api.CreateGitHubSecretSyncJSONBodyDestinationConfig0{
					Org:                   "acme",
					Scope:                 "organization",
					Visibility:            api.CreateGitHubSecretSyncJSONBodyDestinationConfig0VisibilitySelected,
					SelectedRepositoryIds: &[]float32{42},
					SecretType:            &codespaces,
				}))
			return d
		})
		secretmanager.CreateSecret(t, proj, "dev", "DEV_DB_URL", "postgres://dev")

		// Action
		s.trigger(t)

		// Assert
		got := gh.OrgSecretsOfType(t, "acme", github.Codespaces).Secrets["DEV_DB_URL"]
		require.Equal(t, "postgres://dev", got.Value)
		require.Equal(t, "selected", got.Visibility)
		require.Equal(t, []int{42}, got.SelectedRepositoryIDs)
		require.Nil(t, gh.OrgSecrets(t, "acme"), "a Codespaces sync touched the organization's Actions secrets")
	})

	t.Run("should fail naming the limit when more than 100 go to a repository", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Infisical checks before sending, so the sync fails rather than writing
			100 and silently dropping the rest.`)

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		for i := range 101 {
			secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("BULK_%03d", i), "v")
		}

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "100", "the failure does not name the limit")
	})
}

func TestGitHubSync_Create(t *testing.T) {
	t.Parallel()

	t.Run("should push existing secrets when created with auto-sync on", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "PRESENT", "1")

		// Action
		s := newSync(t, proj, conn, repoScope("acme", "app"), autoSync(true))
		s.awaitTerminal(t)

		// Assert
		require.Equal(t, "1", gh.Repo(t, "acme/app").Secrets["PRESENT"].Value)
	})

	t.Run("should write nothing when created with auto-sync off", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `An immediate state read passes before an async push lands, so absence
			is asserted by waiting out a window with ExpectNoEvent.`)

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "PRESENT", "1")

		// Action
		newSync(t, proj, conn, repoScope("acme", "app"), autoSync(false))

		// Assert
		gh.ExpectNoEvent[github.SecretCreated](t, nil)
	})

	t.Run("should refuse a Dependabot sync to a repository environment and write nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "PRESENT", "1")
		dependabot := api.CreateGitHubSecretSyncJSONBodyDestinationConfig2SecretTypeDependabot
		dest := func(tt *testing.T) api.CreateGitHubSecretSyncJSONBody_DestinationConfig {
			var d api.CreateGitHubSecretSyncJSONBody_DestinationConfig
			require.NoError(tt, d.FromCreateGitHubSecretSyncJSONBodyDestinationConfig2(
				api.CreateGitHubSecretSyncJSONBodyDestinationConfig2{
					Owner: "acme", Repo: "app", Env: "prod", Scope: "repository-environment", SecretType: &dependabot,
				}))
			return d
		}

		// Action
		res := createSync(t, proj, conn, dest, autoSync(true))

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Repository environment scope is only available for Actions secrets")
		gh.ExpectNoEvent[github.SecretCreated](t, nil)
	})
}
