package syncs_test

import (
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
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
