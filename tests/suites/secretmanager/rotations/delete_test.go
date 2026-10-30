package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should revoke both credentials and remove the secrets when deleted with both flags", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		first := e.published(t, "/")
		r.mustRotate(t)
		second := e.published(t, "/")

		// Action
		res := r.delete(t, true, true)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		e.requireRefused(t, first, "the inactive credential after the delete")
		e.requireRefused(t, second, "the published credential after the delete")
		require.Empty(t, e.secretsAt(t, "/"))
		require.Empty(t, e.rotationNames(t))
	})

	t.Run("should leave the credential live and the secrets editable when deleted with neither flag", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		published := e.published(t, "/")

		// Action
		res := r.delete(t, false, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		e.requireLogsIn(t, published, "the credential of a rotation deleted without revoking")
		require.Equal(t, published, e.published(t, "/"))
		require.Empty(t, e.rotationNames(t))
		secretmanager.UpdateSecret(t, e.proj, "dev", usernameKey, "hand-written")
		require.Equal(t, "hand-written", e.secretsAt(t, "/")[usernameKey])
	})
}
