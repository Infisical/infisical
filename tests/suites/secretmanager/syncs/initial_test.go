package syncs_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// The initial sync behaviours are plumbing, tested once. They run on Parameter Store
// because GitHub cannot import.
func TestSecretSync_InitialSyncBehavior(t *testing.T) {
	t.Parallel()

	t.Run("should keep the Infisical value for a shared key when the first run imports prioritizing the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "infisical-value")
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "destination-value"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), initialSync("import-prioritize-source"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"/app/API_KEY": "infisical-value"}, parameterValues(t, cp))
		require.Equal(t, map[string]string{"API_KEY": "infisical-value"}, secretsAt(t, proj, "/"))
	})

	t.Run("should take the destination value into Infisical when the first run imports prioritizing the destination", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The import writes back into the project, which is the surprising half of
			this option.`)

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "infisical-value")
		cp.Seed(t, aws.SeedParameter("/app/API_KEY", "destination-value"))
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), initialSync("import-prioritize-destination"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"API_KEY": "destination-value"}, secretsAt(t, proj, "/"))
		require.Equal(t, map[string]string{"/app/API_KEY": "destination-value"}, parameterValues(t, cp))
	})

	t.Run("should overwrite the destination on later runs when the initial behavior imports", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, cp := setupAWS(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newAWSSync(t, proj, conn, parameterStorePath("/app/"), initialSync("import-prioritize-destination"))
		s.trigger(t)
		cp.Seed(t, aws.SeedParameter("/app/LATE_KEY", "late-value"))

		// Action
		s.trigger(t)

		// Assert
		require.Equal(t, map[string]string{"API_KEY": "api-value"}, secretsAt(t, proj, "/"))
		require.Equal(t, map[string]string{"/app/API_KEY": "api-value"}, parameterValues(t, cp))
	})
}
