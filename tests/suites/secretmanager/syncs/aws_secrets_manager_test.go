package syncs_test

import (
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func secretNamed(name string) func(aws.SecretDeleted) bool {
	return func(e aws.SecretDeleted) bool { return e.Name == name }
}

// document decodes a many-to-one secret's JSON body.
func document(t *testing.T, raw string) map[string]string {
	t.Helper()
	var out map[string]string
	require.NoErrorf(t, json.Unmarshal([]byte(raw), &out), "the secret is not a key-value document: %s", raw)
	return out
}

// Provider logic only. The plumbing every sync shares is covered on GitHub.
func TestAwsSecretsManagerSync_SyncSecrets(t *testing.T) {
	t.Parallel()

	t.Run("should hold each secret as its own AWS secret and delete one Infisical no longer holds when mapped one to one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedSecret("STALE", "old"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		secretmanager.CreateSecret(t, proj, "dev", "B", "2")
		s := newAWSSync(t, proj, conn, oneToOne())

		// Action
		s.trigger(t)

		// Assert
		cp.SecretsManager.ExpectEvent[aws.SecretDeleted](t, secretNamed("STALE"))
		require.Equal(t, map[string]string{"A": "1", "B": "2"}, secretValues(t, cp))
	})

	t.Run("should hold every secret as one JSON document under the configured name when mapped many to one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		secretmanager.CreateSecret(t, proj, "dev", "B", "2")
		s := newAWSSync(t, proj, conn, manyToOne("bundle"))

		// Action
		s.trigger(t)

		// Assert
		got := secretValues(t, cp)
		require.Len(t, got, 1, "many to one wrote more than one secret: %v", got)
		require.Equal(t, map[string]string{"A": "1", "B": "2"}, document(t, got["bundle"]))
	})

	t.Run("should name the document by the key schema and keep the keys inside it as they are when mapped many to one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		s := newAWSSync(t, proj, conn, manyToOne("bundle"), keySchema("INF_{{secretKey}}"))

		// Action
		s.trigger(t)

		// Assert
		got := secretValues(t, cp)
		require.Contains(t, got, "INF_bundle")
		require.Equal(t, map[string]string{"A": "1"}, document(t, got["INF_bundle"]))
	})

	t.Run("should update the one document in place when a value changes and it is mapped many to one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "A", "1")
		s := newAWSSync(t, proj, conn, manyToOne("bundle"))
		s.trigger(t)
		mark := cp.SecretsManager.Mark(t)
		secretmanager.UpdateSecret(t, proj, "dev", "A", "2")

		// Action
		s.trigger(t)

		// Assert
		cp.SecretsManager.ExpectEvent[aws.SecretUpdated](t, func(e aws.SecretUpdated) bool { return e.Name == "bundle" }, fakenet.Since(mark))
		cp.SecretsManager.ExpectNoEvent[aws.SecretCreated](t, nil, fakenet.Since(mark))
		require.Equal(t, map[string]string{"A": "2"}, document(t, secretValues(t, cp)["bundle"]))
	})

	t.Run("should fail the import naming the format when the many to one document is not key-value JSON", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t, aws.SeedSecret("bundle", "not json"))
		s := newAWSSync(t, proj, conn, manyToOne("bundle"))

		// Action
		got := s.importSecrets(t, "prioritize-source")

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "Invalid format for Many-To-One mapping behavior")
		require.Empty(t, secretsAt(t, proj, "/"))
	})
}
