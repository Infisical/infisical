package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_Create(t *testing.T) {
	t.Parallel()

	t.Run("should issue the first credential and write it to the mapped secrets, so that it logs in", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got := decode(t, res.Body)
		require.Equal(t, 0, got.ActiveIndex)
		require.Equal(t, "success", got.RotationStatus)
		published := e.published(t, "/")
		require.Equal(t, e.users[0].name, published.name)
		e.requireLogsIn(t, published, "the published credential")
		e.requireRefused(t, e.users[0], "the first user's password from before the rotation")
		e.requireRefused(t, e.users[1], "the second user's password from before the rotation")
	})

	t.Run("should refuse a name already used at the path and leave the users alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		first := e.newRotation(t)
		a, aPw := e.target.NewRole(t)
		b, bPw := e.target.NewRole(t)

		// Action
		res := e.create(t, rotationName(first.Name), usernames(a, b), mapping("OTHER_USERNAME", "OTHER_PASSWORD"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), first.Name)
		require.Equal(t, []string{first.Name}, e.rotationNames(t))
		e.requireLogsIn(t, role{a, aPw}, "a user of the refused rotation")
		e.requireLogsIn(t, role{b, bPw}, "a user of the refused rotation")
	})

	t.Run("should refuse a mapped key that already exists and keep its value and the users", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		secretmanager.CreateSecret(t, e.proj, "dev", usernameKey, "hand-written")

		// Action
		res := e.create(t)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), usernameKey)
		require.Equal(t, map[string]string{usernameKey: "hand-written"}, e.secretsAt(t, "/"))
		e.requireLogsIn(t, e.users[0], "a user of the refused rotation")
	})

	t.Run("should refuse duplicate mapping keys and leave the users alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t, mapping("SAME_KEY", "SAME_KEY"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "must be unique")
		require.Empty(t, e.rotationNames(t))
		e.requireLogsIn(t, e.users[0], "a user of the refused rotation")
	})

	t.Run("should refuse naming the path and environment when the folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t, atPath("/does/not/exist"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "/does/not/exist")
		require.Contains(t, apierr.Body(res.Body), "dev")
		e.requireLogsIn(t, e.users[0], "a user of the refused rotation")
	})

	t.Run("should leave no rotation, no secrets and the first user's password when the database refuses", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t, usernames(e.users[0].name, "missing_"+e.users[1].name))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "does not exist")
		require.Empty(t, e.rotationNames(t))
		require.Empty(t, e.secretsAt(t, "/"))
		e.requireLogsIn(t, e.users[0], "the first user after the refused rotation")
	})

	t.Run("should refuse a rotation user that is the connection's own user", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t, usernames(e.target.User, e.users[1].name))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "cannot be the same as the connection username")
		require.Empty(t, e.rotationNames(t))
		e.requireLogsIn(t, role{e.target.User, e.target.Password}, "the connection user")
	})
}
