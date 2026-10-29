package syncs_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Status(t *testing.T) {
	t.Parallel()

	t.Run("should end succeeded and deliver the value when the first sync job fails", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The HTTP client retries a 500 three times inside one job, so four failures
			fail the first job. The queue then retries the job after a 3 s backoff, which fits
			the wait; a failure on every attempt would not.`)

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "api-value")
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		gh.Fail(t, "PUT", "/repos/acme/app/actions/secrets/*", http.StatusInternalServerError, fakenet.Times(4))

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equalf(t, "succeeded", got.status, "the sync did not recover: %s", got.message)
		require.Equal(t, "api-value", gh.Repo(t, "acme/app").Secrets["API_KEY"].Value)
		require.Equal(t, 5, gh.Received(t, "PUT", "/repos/acme/app/actions/secrets/API_KEY"))
	})

	t.Run("should leave lastSyncedAt empty after a failed run and set it after a successful one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		createSecrets(t, proj, 101)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		require.Equal(t, "failed", s.triggerExpectingFailure(t).status)
		require.Nil(t, s.get(t).JSON200.SecretSync.LastSyncedAt, "a failed run recorded a sync time")
		secretmanager.DeleteSecret(t, proj, "dev", "BULK_000")

		// Action
		s.trigger(t)

		// Assert
		require.NotNil(t, s.get(t).JSON200.SecretSync.LastSyncedAt)
	})

	t.Run("should keep lastSyncedAt at the last success when a later run fails", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		createSecrets(t, proj, 100)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		s.trigger(t)
		synced := s.get(t).JSON200.SecretSync.LastSyncedAt
		require.NotNil(t, synced)
		secretmanager.CreateSecret(t, proj, "dev", "ONE_TOO_MANY", "v")

		// Action
		got := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", got.status)
		after := s.get(t).JSON200.SecretSync.LastSyncedAt
		require.NotNil(t, after)
		require.True(t, synced.Equal(*after), "lastSyncedAt moved from %s to %s on a failed run", synced, after)
	})

	t.Run("should fail saying the folder no longer exists while the source environment is deleted, and succeed once it is restored", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] The folder still exists; its environment is soft-deleted. The message
			blames the folder, so the fix updates this claim.`)

		// Setup
		proj, conn, gh := setup(t)
		secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "api-value")
		s := newSync(t, proj, conn, repoScope("acme", "app"), fromEnv("staging"))
		envID := environmentID(t, proj, "staging")
		admin := proj.Tenant().Admin.API
		deleted, err := admin.DeleteEnvironmentWithResponse(t.Context(), proj.ID, envID, nil)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deleted.StatusCode(), "deleting the environment returned %s", apierr.Body(deleted.Body))

		// Action
		failed := s.triggerExpectingFailure(t)
		restored, err := admin.RestoreEnvironmentWithResponse(t.Context(), proj.ID, envID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, restored.StatusCode(), "restoring the environment returned %s", apierr.Body(restored.Body))
		recovered := s.triggerExpectingFailure(t)

		// Assert
		require.Equal(t, "failed", failed.status)
		require.Contains(t, failed.message, "folder no longer exists")
		require.Equalf(t, "succeeded", recovered.status, "the sync did not recover: %s", recovered.message)
		require.Equal(t, "api-value", gh.Repo(t, "acme/app").Secrets["API_KEY"].Value)
	})

	t.Run("should hide a sync once its project is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		s := newSync(t, proj, conn, repoScope("acme", "app"))
		admin := proj.Tenant().Admin.API
		res, err := admin.DeleteProjectWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the project returned %s", apierr.Body(res.Body))

		// Action
		got, err := admin.GetGitHubSecretSyncWithResponse(t.Context(), s.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, got.StatusCode())
		require.Equal(t, fmt.Sprintf(`Could not find GitHub Sync with ID "%s"`, s.ID), message(got.Body))
	})
}

// createSecrets creates BULK_000 to BULK_<n-1> at the root of dev in one request.
func createSecrets(tt *testing.T, p *fixture.Project, n int) {
	tt.Helper()
	secrets := make([]map[string]string, 0, n)
	for i := range n {
		secrets = append(secrets, map[string]string{"secretKey": fmt.Sprintf("BULK_%03d", i), "secretValue": "v"})
	}
	raw, err := json.Marshal(map[string]any{"projectId": p.ID, "environment": "dev", "secrets": secrets})
	require.NoError(tt, err)
	res, err := p.Tenant().Admin.API.CreateManySecretsV4WithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating %d secrets returned %s", n, apierr.Body(res.Body))
}

func environmentID(tt *testing.T, p *fixture.Project, slug string) string {
	tt.Helper()
	res, err := p.Tenant().Admin.API.GetEnvironmentBySlugWithResponse(tt.Context(), p.ID, slug)
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "reading environment %s returned %d: %s", slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Environment.Id.String()
}
