package syncs_test

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/vercel"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Vercel gets tests only for its own logic, per docs/fakes.md; the sync plumbing is
// covered through GitHub.

const vercelProject = "prj_app"

// The message Vercel answers a name it does not accept with, which the sync reports.
const vercelInvalidKeyMessage = "The name of your Environment Variable contains invalid characters. Only letters, digits, and underscores are allowed. Furthermore, the name should not start with a digit."

func setupVercel(t *testing.T) (*fixture.Project, uuid.UUID, *vercel.ControlPlane) {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	conn := fixture.NewAppConnection(t, tn, fixture.VercelAPITokenAppConnection)
	return proj, newVercelSync(t, proj, conn), vercel.Open(t, conn.FakenetAdmin(t), conn.Nonce())
}

// newVercelSync syncs dev:/ to the production environment of one Vercel project. Sent as
// JSON because the generated body's destination config is a union and would serialise
// as {}.
func newVercelSync(t *testing.T, proj *fixture.Project, conn *fixture.AppConnection) uuid.UUID {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"name":              "sync-" + uuid.NewString()[:8],
		"projectId":         proj.ID,
		"connectionId":      conn.ID,
		"environment":       "dev",
		"secretPath":        "/",
		"isAutoSyncEnabled": false,
		"syncOptions":       map[string]any{"initialSyncBehavior": "overwrite-destination"},
		"destinationConfig": map[string]any{
			"scope": "project", "app": vercelProject, "appName": "app", "env": "production", "teamId": "team_harness",
		},
	})
	require.NoError(t, err)
	res, err := proj.Tenant().Admin.API.CreateVercelSecretSyncWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err, "creating a Vercel sync")
	require.NotNilf(t, res.JSON200, "creating a Vercel sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.SecretSync.Id
}

// syncVercel runs the sync and waits for the status it ends with.
func syncVercel(t *testing.T, proj *fixture.Project, syncID uuid.UUID) outcome {
	t.Helper()
	whenIdle(t, "triggering a Vercel sync", func(ctx context.Context) (int, []byte, error) {
		res, err := proj.Tenant().Admin.API.SyncVercelSecretSyncWithResponse(ctx, syncID)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	})

	got, err := wait.For(t.Context(), func(ctx context.Context) (outcome, bool, error) {
		res, err := proj.Tenant().Admin.API.GetVercelSecretSyncWithResponse(ctx, syncID)
		if err != nil || res.JSON200 == nil {
			return outcome{}, false, err
		}
		var out outcome
		if s := res.JSON200.SecretSync.SyncStatus; s != nil {
			out.status = *s
		}
		if m := res.JSON200.SecretSync.LastSyncMessage; m != nil {
			out.message = *m
		}
		return out, out.status == "succeeded" || out.status == "failed", nil
	})
	require.NoError(t, err, "waiting for the Vercel sync to finish")
	return got
}

func TestVercelSecretSync_Keys(t *testing.T) {
	t.Parallel()

	for _, key := range []string{"1API_KEY", "API-KEY"} {
		t.Run("should fail on the first attempt with Vercel's reason when Vercel refuses the name "+key, func(t *testing.T) {
			t.Parallel()
			spec.Why(t, `Vercel answers env_key_invalid_characters, which the sync treats as unable to
				ever succeed. A sync records failed only once no attempt is left, so a failed status
				after a single create proves the queue did not retry it.`)

			// Setup
			proj, syncID, fake := setupVercel(t)
			secretmanager.CreateSecret(t, proj, "dev", key, "value")

			// Action
			got := syncVercel(t, proj, syncID)

			// Assert
			require.Equal(t, "failed", got.status)
			require.Contains(t, got.message, vercelInvalidKeyMessage)
			require.Equal(t, 1, fake.Received(t, "POST", "/v10/projects/"+vercelProject+"/env"))
			require.Empty(t, fake.Envs(t, vercelProject))
		})
	}

	t.Run("should create an encrypted variable for the sync's environment when Vercel accepts the name", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, syncID, fake := setupVercel(t)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Action
		got := syncVercel(t, proj, syncID)

		// Assert
		require.Equalf(t, "succeeded", got.status, "the sync failed: %s", got.message)
		envs := fake.Envs(t, vercelProject)
		require.Len(t, envs, 1)
		require.Equal(t, vercel.Env{Key: "API_KEY", Value: "value", Type: "encrypted", Target: []string{"production"}},
			vercel.Env{Key: envs[0].Key, Value: envs[0].Value, Type: envs[0].Type, Target: envs[0].Target})
	})
}
