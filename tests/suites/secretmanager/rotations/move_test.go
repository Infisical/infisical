package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_Move(t *testing.T) {
	t.Parallel()

	t.Run("should carry the mapped secrets to the destination folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		secretmanager.CreateFolder(t, e.proj, "dev", "/services")
		r := e.newRotation(t)
		published := e.published(t, "/")

		// Action
		res := r.move(t, e.tn.Admin.API, "/services")

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "/services", r.view(t).Folder.Path)
		require.Equal(t, published, e.published(t, "/services"))
		require.Empty(t, e.secretsAt(t, "/"))
	})

	t.Run("should refuse a move to the folder the rotation is already in", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)

		// Action
		res := r.move(t, e.tn.Admin.API, "/")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "Source and destination locations are the same")
		require.Equal(t, "/", r.view(t).Folder.Path)
	})

	t.Run("should refuse a move onto existing keys and leave both folders as they were", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		secretmanager.CreateFolder(t, e.proj, "dev", "/services")
		secretmanager.CreateSecret(t, e.proj, "dev", usernameKey, "already here", secretmanager.WithPath("/services"))
		r := e.newRotation(t)
		published := e.published(t, "/")

		// Action
		res := r.move(t, e.tn.Admin.API, "/services")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "overwriteDestination")
		require.Equal(t, "/", r.view(t).Folder.Path)
		require.Equal(t, published, e.published(t, "/"))
		require.Equal(t, map[string]string{usernameKey: "already here"}, e.secretsAt(t, "/services"))
	})

	t.Run("should refuse a move to a folder the actor cannot create rotations in", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		secretmanager.CreateFolder(t, e.proj, "dev", "/services")
		e.proj.NewRole(t, "root-rotations", fixture.Permission{
			Subject:    "secret-rotation",
			Action:     []string{"read", "create", "delete"},
			Conditions: map[string]any{"secretPath": map[string]any{"$eq": "/"}},
		})
		operator := e.proj.NewMachineIdentity(t, fixture.WithRoles("root-rotations"))
		r := e.newRotation(t)

		// Action
		res := r.move(t, operator.API, "/services")

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "/", r.view(t).Folder.Path)
		require.Empty(t, e.secretsAt(t, "/services"))
	})
}
