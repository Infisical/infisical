package syncs_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
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

func TestAwsSecretsManagerSync_PreserveFolderStructure(t *testing.T) {
	t.Parallel()

	t.Run("should start the name of a secret in a folder with that folder, and keep the name of a source-folder secret", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Secrets Manager has no folders, so a name in a folder starts with "/" the way a
			Parameter Store path does. A secret in the source folder keeps the name it has without
			the option, so turning the option on doesn't rename it.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		duplicateUnder(t, proj, "/backend", "DB_URL")
		s := newAWSSync(t, proj, conn, oneToOne(), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{
			"DB_URL":        "value-for-/backend",
			"/child/DB_URL": "value-for-/backend/child",
		}, secretValues(t, cp))
	})

	t.Run("should leave a secret matching its key schema alone when it is outside the folders it mirrors", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Another sync's "team-a/INF_DB_PASS" ends in a name matching "INF_{{secretKey}}",
			but it isn't shaped like a mirrored name. Secrets Manager deletes without recovery, so
			deleting it would lose that secret for good.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateFolder(t, proj, "dev", "/team-a")
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "a", secretmanager.WithPath("/team-a"))
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		other := newAWSSync(t, proj, conn, oneToOne(), fromPath("/team-a"), keySchema("team-a/INF_{{secretKey}}"))
		other.trigger(t)
		s := newAWSSync(t, proj, conn, oneToOne(), fromPath("/backend"), includeSubFolders(), preserveFolders(), keySchema("INF_{{secretKey}}"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/api/INF_KEEP": "v", "team-a/INF_DB_PASS": "a"}, secretValues(t, cp))
	})

	t.Run("should delete stale secrets in the folders it mirrors and leave names not shaped like its own", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A mirroring sync writes "NAME" for the source folder and "/folder/NAME" below it.
			"api/STALE" has no leading "/" and "/STALE" has no folder, so neither can be one of its
			names, even though "api" is one of its folders.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		cp.Seed(t,
			aws.SeedSecret("STALE", "old"),
			aws.SeedSecret("/api/STALE", "old"),
			aws.SeedSecret("api/STALE", "theirs"),
			aws.SeedSecret("/STALE", "theirs"),
		)
		secretmanager.CreateFolder(t, proj, "dev", "/backend/api")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "v", secretmanager.WithPath("/backend/api"))
		s := newAWSSync(t, proj, conn, oneToOne(), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/api/KEEP": "v", "api/STALE": "theirs", "/STALE": "theirs"}, secretValues(t, cp))
	})

	t.Run("should refuse and keep one-to-one when an update switches only the mapping to many-to-one", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The update carries no syncOptions, so the stored option stays on. Many-to-one
			writes every secret into one AWS secret, so it can't keep the folders, and a saved sync
			would claim to preserve folder structure while flattening.`)

		// Setup
		proj, conn, _ := setupAWS(t)
		s := newAWSSync(t, proj, conn, oneToOne(), fromPath("/"), includeSubFolders(), preserveFolders())

		// Action
		status, body := s.update(t, map[string]any{"destinationConfig": manyToOne("bundle").config})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, message(body), "Preserving folder structure is not supported with")
		got, err := s.view(t.Context())
		require.NoError(t, err)
		require.Equal(t, "one-to-one", got.DestinationConfig["mappingBehavior"])
	})

	t.Run("should refuse when an update turns on preserving folder structure for a stored many-to-one sync", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The update carries no destinationConfig, so the stored many-to-one mapping
			stays, and the request alone can't show the two settings conflict.`)

		// Setup
		proj, conn, _ := setupAWS(t)
		s := newAWSSync(t, proj, conn, manyToOne("bundle"), fromPath("/"), includeSubFolders())

		// Action
		status, body := s.update(t, map[string]any{"syncOptions": map[string]any{
			"initialSyncBehavior":     "overwrite-destination",
			"preserveFolderStructure": true,
		}})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, message(body), "Preserving folder structure is not supported with")
		got, err := s.view(t.Context())
		require.NoError(t, err)
		require.Nil(t, got.SyncOptions["preserveFolderStructure"])
	})

	t.Run("should refuse and create nothing when preserving folder structure with many-to-one mapping", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setupAWS(t)
		dest := manyToOne("bundle")

		// Action
		status, body := createAWSSync(t, proj, conn, dest, fromPath("/"), includeSubFolders(), preserveFolders())

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, status)
		require.Contains(t, message(body), "Preserving folder structure is not supported with")
		require.Zero(t, awsSyncCount(t, proj, dest))
	})

	t.Run("should fail naming the secret and write nothing when its name would be longer than Secrets Manager allows", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Secrets Manager allows 512 characters. Three 170-character folders and the key make 521.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		long := "/backend/" + strings.Repeat("a", 170) + "/" + strings.Repeat("b", 170) + "/" + strings.Repeat("c", 170)
		secretmanager.CreateFolder(t, proj, "dev", long)
		secretmanager.CreateSecret(t, proj, "dev", "SHORT", "v", secretmanager.WithPath("/backend"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "v", secretmanager.WithPath(long))
		s := newAWSSync(t, proj, conn, oneToOne(), fromPath("/backend"), includeSubFolders(), preserveFolders())

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		require.Contains(t, got.message, "521 characters")
		require.Empty(t, cp.Secrets(t))
	})
}
