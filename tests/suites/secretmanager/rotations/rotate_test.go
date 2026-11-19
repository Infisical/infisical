package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_Rotate(t *testing.T) {
	t.Parallel()

	t.Run("should flip the active index and publish the other user, so that it logs in", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		before := e.published(t, "/")

		// Action
		got := r.mustRotate(t)

		// Assert
		require.Equal(t, 1, got.ActiveIndex)
		after := e.published(t, "/")
		require.Equal(t, e.users[1].name, after.name)
		e.requireLogsIn(t, after, "the newly published credential")
		e.requireLogsIn(t, before, "the previous credential, which stays live until the next rotation")
	})

	t.Run("should return both credentials with the newest in the active slot", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		r.mustRotate(t)
		r.mustRotate(t)

		// Action
		res := r.generated(t, e.tn.Admin.API)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.EqualValues(t, 0, res.JSON200.ActiveIndex)
		creds := res.JSON200.GeneratedCredentials
		require.Len(t, creds, 2)
		require.Equal(t, e.users[0].name, creds[0].Username)
		require.Equal(t, e.users[1].name, creds[1].Username)
		require.Equal(t, role{creds[0].Username, creds[0].Password}, e.published(t, "/"))
		e.requireLogsIn(t, role{creds[0].Username, creds[0].Password}, "the active credential")
		e.requireLogsIn(t, role{creds[1].Username, creds[1].Password}, "the inactive credential")
	})

	t.Run("should answer 500 with the rotation error, keep the working credential published, and record failed when a manual rotation fails", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Today's behaviour, pinned so the planned fix finds it: rotateSecretRotation
			wraps the provider error in an InternalServerError, so a refusal by the database
			reads as a server fault.`)

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		before := e.published(t, "/")
		e.target.DropRole(t, e.users[1].name)

		// Action
		res := r.rotate(t)

		// Assert
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "does not exist")
		require.Equal(t, before, e.published(t, "/"))
		e.requireLogsIn(t, before, "the credential published before the failed rotation")
		got := r.view(t)
		require.Equal(t, "failed", got.RotationStatus)
		require.Equal(t, 0, got.ActiveIndex)
		require.NotNil(t, got.LastRotationMessage)
		require.Contains(t, *got.LastRotationMessage, "does not exist")
	})
}
