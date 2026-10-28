package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
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

	t.Run("should move the mapped secrets without an approval request when both folders have an approval policy", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A rotation writes its mapped secrets itself, so moving it moves them directly
			and opens no secret change request, even for an actor with no secret permissions.`)

		// Setup
		e := setup(t)
		secretmanager.CreateFolder(t, e.proj, "dev", "/services")
		r := e.newRotation(t)
		published := e.published(t, "/")
		for _, path := range []string{"/", "/services"} {
			secretmanager.CreateApprovalPolicy(t, e.proj, secretmanager.Location{Env: "dev", Path: path}, e.tn.Admin)
		}
		e.proj.NewRole(t, "rotation-mover", fixture.Permission{
			Subject: "secret-rotation",
			Action:  []string{"read", "create", "delete"},
		})
		mover := e.proj.NewMachineIdentity(t, fixture.WithRoles("rotation-mover"))

		// Action
		res := r.move(t, mover.API, "/services")

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, published, e.published(t, "/services"))
		require.Empty(t, e.secretsAt(t, "/"))
		require.Zero(t, e.openApprovalRequests(t))
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

// openApprovalRequests is the number of secret change requests waiting in the project.
func (e env) openApprovalRequests(t *testing.T) int {
	t.Helper()
	res, err := e.tn.Admin.API.GetSecretApprovalRequestCountWithResponse(t.Context(),
		&api.GetSecretApprovalRequestCountParams{ProjectId: e.proj.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "counting approval requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	if res.JSON200.Approvals.Open == nil {
		return 0
	}
	return int(*res.JSON200.Approvals.Open)
}
