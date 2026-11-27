package syncs_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// Provider logic only. The plumbing every sync shares is covered on GitHub.
func TestAwsParameterStoreSync_SyncSecrets(t *testing.T) {
	t.Parallel()

	t.Run("should remove every parameter Infisical does not hold when the path spans several pages", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `GetParametersByPath answers at most 10 a page and DeleteParameters takes
			at most 10 names, so a sync that stopped at the first page or sent one batch
			would leave stale parameters behind.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		for i := range 25 {
			cp.Seed(t, aws.SeedParameter(fmt.Sprintf("/app/STALE_%02d", i), "old"))
		}
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/KEEP": "v"}, parameterValues(t, cp))
	})

	t.Run("should leave parameters below the path alone when syncing to it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/team/OTHER", "theirs"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/A": "1", "/app/team/OTHER": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should place parameters under the path segment the key schema names and prune only there", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/OUTSIDE", "theirs"), aws.SeedParameter("/app/dev/STALE", "old"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "postgres://db")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), keySchema("{{environment}}/{{secretKey}}"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/dev/DB_URL": "postgres://db", "/app/OUTSIDE": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should fail naming the rule and write nothing when the key schema starts with a slash", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The create schema allows a slash anywhere, so this is refused only when
			the sync runs.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), keySchema("/{{secretKey}}"))

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "Key schema cannot contain leading '/'")
		require.Empty(t, cp.Parameters(t))
	})

	t.Run("should fail naming the rule and write nothing when the key schema has a slash after the secret key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), keySchema("{{secretKey}}/value"))

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "Key schema cannot contain '/' after {{secretKey}}")
		require.Empty(t, cp.Parameters(t))
	})

	t.Run("should skip an empty value and remove the parameter it held", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Parameter Store refuses an empty value, so the sync deletes the parameter
			rather than leave the old value behind.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/EMPTIED", "old"))
		secretmanager.CreateSecret(t, proj, "dev", "EMPTIED", "")
		secretmanager.CreateSecret(t, proj, "dev", "FULL", "v")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/FULL": "v"}, parameterValues(t, cp))
	})

	t.Run("should fail naming the missing tag permissions and change nothing when tags are set and listing tags is denied", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The one destination refusal the sync does not retry, so the failure lands
			within one run rather than after five attempts and their backoff.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "old"), aws.Deny(aws.SSM, "ListTagsForResource"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), withTag("team", "core"))

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "IAM role has inadequate permissions to manage resource tags")
		require.Equal(t, map[string]string{"/app/API_KEY": "old"}, parameterValues(t, cp))
		require.Equal(t, map[string]string{"API_KEY": "api-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should sync without tag permissions when no tags are set", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "old"), aws.Deny(aws.SSM, "ListTagsForResource"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/API_KEY": "api-value"}, parameterValues(t, cp))
	})

	t.Run("should tag the parameters it writes when tags are set", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), withTag("team", "core"))

		// Action
		s.trigger(t)

		// Assert
		got := cp.Parameters(t)["/app/API_KEY"]
		require.NotNil(t, got, "the parameter was not written")
		require.Equal(t, map[string]string{"team": "core"}, got.Tags)
		require.Equal(t, "SecureString", got.Type)
	})
}

func TestAwsParameterStoreSync_PreserveFolderStructure(t *testing.T) {
	t.Parallel()

	t.Run("should write each secret under its folder's path below the sync's path", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api/payments")
		secretmanager.CreateSecret(t, proj, "dev", "A", "1", secretmanager.WithPath("/backend"))
		secretmanager.CreateSecret(t, proj, "dev", "B", "2", secretmanager.WithPath("/backend/api"))
		secretmanager.CreateSecret(t, proj, "dev", "C", "3", secretmanager.WithPath("/backend/api/payments"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/A": "1", "/app/api/B": "2", "/app/api/payments/C": "3"}, parameterValues(t, cp))
	})

	t.Run("should accept and keep apart the same key held by two folders", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Flattened, the two would share one name and the create is refused. Kept in
			their folders, they land at two different paths.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		duplicateUnder(t, proj, "/backend", "DB_URL")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{
			"/app/DB_URL":       "value-for-/backend",
			"/app/child/DB_URL": "value-for-/backend/child",
		}, parameterValues(t, cp))
	})

	t.Run("should delete parameters in each folder it mirrors that Infisical no longer holds, including an empty folder", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A folder's parameters sit below the path, where a flattened sync never looks.
			An empty folder still counts, or the copy of its last secret would stay behind.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t,
			aws.SeedParameter("/app/STALE", "old"),
			aws.SeedParameter("/app/api/STALE", "old"),
			aws.SeedParameter("/app/empty/STALE", "old"),
			aws.SeedParameter("/elsewhere/OTHER", "theirs"),
		)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateFolder(t, proj, "dev", "/backend/empty")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/api/KEEP": "v", "/elsewhere/OTHER": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should leave parameters below its path alone when they are outside the folders it mirrors", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `They belong to something else, such as another sync writing to a deeper path.
			Deleting them would remove that sync's parameters on every run.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateFolder(t, proj, "dev", "/team-a")
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "a", secretmanager.WithPath("/team-a"))
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		other := newAWSSync(t, proj, conn, parameterStorePath("/app/team-a/"), fromPath("/team-a"))
		other.trigger(t)
		cp.Seed(t, aws.SeedParameter("/app/api/nested/MANUAL", "theirs"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{
			"/app/api/KEEP":          "v",
			"/app/api/nested/MANUAL": "theirs",
			"/app/team-a/DB_PASS":    "a",
		}, parameterValues(t, cp))
	})

	t.Run("should not decrypt parameters below its path outside the folders it mirrors", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `They belong to something else, such as another team's parameters. The sync has
			no use for their values, and its role may not be allowed to use their KMS key.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t,
			aws.SeedParameter("/app/api/KEEP", "old"),
			aws.SeedParameter("/app/team-a/DB_PASS", "theirs"),
		)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		cp.SSM.ExpectEvent[aws.ParameterDecrypted](t, func(e aws.ParameterDecrypted) bool { return e.Name == "/app/api/KEEP" })
		cp.SSM.ExpectNoEvent[aws.ParameterDecrypted](t, func(e aws.ParameterDecrypted) bool { return e.Name == "/app/team-a/DB_PASS" })
		require.Equal(t, map[string]string{"/app/api/KEEP": "v", "/app/team-a/DB_PASS": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should sync when a parameter below its path outside the folders it mirrors uses a KMS key it cannot use", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Another team's parameter can sit below the path, encrypted with a key this
			connection may not use. AWS refuses a whole read that includes it, so reading
			everything below the path would fail every run.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t,
			aws.SeedUnusableKey("alias/team-a"),
			aws.SeedParameterWithKey("/app/team-a/DB_PASS", "theirs", "alias/team-a"),
		)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/api/KEEP": "v", "/app/team-a/DB_PASS": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should fail naming the parameter and write nothing when one in a folder it mirrors uses a KMS key it cannot use", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The sync manages that folder, so it has to read the parameter. AWS's refusal
			names the key and the account, not the parameter, so the message names it instead.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t,
			aws.SeedUnusableKey("alias/team-a"),
			aws.SeedParameterWithKey("/app/api/LOCKED", "theirs", "alias/team-a"),
		)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "/app/api/LOCKED")
		require.Contains(t, got.message, "kms:Decrypt")
		require.NotContains(t, got.message, "arn:aws")
		require.Equal(t, map[string]string{"/app/api/LOCKED": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should decrypt no parameter when its secrets are removed", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Removal deletes by name, so it has no use for any value below the path.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/app/team-a/DB_PASS", "theirs"))
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())
		s.trigger(t)
		mark := cp.SSM.Mark(t)

		// Action
		got := s.removeSecrets(t)

		// Assert
		require.Equalf(t, "succeeded", got.status, "the remove failed: %s", got.message)
		cp.SSM.ExpectNoEvent[aws.ParameterDecrypted](t, nil, fakenet.Since(mark))
		require.Equal(t, map[string]string{"/app/team-a/DB_PASS": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should delete every parameter it wrote, including both copies of a shared key, when its secrets are removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedParameter("/elsewhere/OTHER", "theirs"))
		duplicateUnder(t, proj, "/backend", "DB_URL")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())
		s.trigger(t)

		// Action
		got := s.removeSecrets(t)

		// Assert
		require.Equalf(t, "succeeded", got.status, "the remove failed: %s", got.message)
		require.Equal(t, map[string]string{"/elsewhere/OTHER": "theirs"}, parameterValues(t, cp))
	})

	t.Run("should fail naming the parameter and write nothing when a secret's folder is too deep for Parameter Store", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Parameter Store allows 15 levels. "/app/" and 14 folders put the secret at 16.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		deep := tooDeepFolder("/backend")
		secretmanager.CreateFolder(t, proj, "dev", deep)
		secretmanager.CreateSecret(t, proj, "dev", "SHALLOW", "v", secretmanager.WithPath("/backend"))
		secretmanager.CreateSecret(t, proj, "dev", "DEEP", "v", secretmanager.WithPath(deep))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "levels deep")
		require.Empty(t, cp.Parameters(t))
	})

	t.Run("should sync the rest when only an empty secret's folder is too deep for Parameter Store", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `An empty value is never written, so its depth doesn't matter.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		deep := tooDeepFolder("/backend")
		secretmanager.CreateFolder(t, proj, "dev", deep)
		secretmanager.CreateSecret(t, proj, "dev", "SHALLOW", "v", secretmanager.WithPath("/backend"))
		secretmanager.CreateSecret(t, proj, "dev", "DEEP", "", secretmanager.WithPath(deep))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/SHALLOW": "v"}, parameterValues(t, cp))
	})

	t.Run("should refuse and create nothing when preserving folder structure without subfolders", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setupAWS(t)
		dest := parameterStorePath("/app/")

		// Action
		status, body := createAWSSync(t, proj, conn, dest, preserveFolders())

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, message(body), "Preserving folder structure only applies to a sync that includes subfolders")
		require.Zero(t, awsSyncCount(t, proj, dest))
	})

	t.Run("should refuse an update that turns off subfolders while the stored option preserves folder structure", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The update carries no syncOptions, so the stored option stays on. Accepting it
			would store an option the sync ignores, and the edit form would refuse every later save.`)

		// Setup
		proj, conn, _ := setupAWS(t)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		status, body := s.update(t, map[string]any{"includeAllSubFolders": false})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, message(body), "Preserving folder structure only applies to a sync that includes subfolders")
	})
}

// tooDeepFolder is 14 folders below root, one more than fits below a Parameter Store path
// of "/app/" within the 15-level limit.
func tooDeepFolder(root string) string {
	folder := root
	for i := range 14 {
		folder = fmt.Sprintf("%s/l%d", folder, i)
	}
	return folder
}
