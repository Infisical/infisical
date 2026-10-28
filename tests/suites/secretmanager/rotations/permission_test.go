package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretRotation_Permission(t *testing.T) {
	t.Parallel()

	for _, projectRole := range []string{"member", "viewer"} {
		t.Run("should refuse generated credentials and a credential check to a "+projectRole, func(t *testing.T) {
			t.Parallel()

			// Setup
			e := setup(t)
			actor := e.proj.NewMachineIdentity(t, fixture.WithRoles(projectRole))
			r := e.newRotation(t)

			// Action
			generated := r.generated(t, actor.API)
			checked := r.check(t, actor.API)

			// Assert
			requireStatus(t, http.StatusForbidden, generated.StatusCode(), generated.Body)
			require.NotContains(t, string(generated.Body), e.published(t, "/").password)
			requireStatus(t, http.StatusForbidden, checked.StatusCode(), checked.Body)
		})
	}

	t.Run("should return generated credentials and a credential check to a role granted only that action", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `New projects refuse additional privileges, so a custom role grants the one
			action. Without this, the refusals above would also pass if the routes refused everyone.`)

		// Setup
		e := setup(t)
		e.proj.NewRole(t, "credentials-reader", fixture.Permission{
			Subject: "secret-rotation",
			Action:  []string{"read-generated-credentials"},
		})
		actor := e.proj.NewMachineIdentity(t, fixture.WithRoles("credentials-reader"))
		r := e.newRotation(t)

		// Action
		generated := r.generated(t, actor.API)
		checked := r.check(t, actor.API)

		// Assert
		requireStatus(t, http.StatusOK, generated.StatusCode(), generated.Body)
		require.Contains(t, string(generated.Body), e.published(t, "/").password)
		requireStatus(t, http.StatusNoContent, checked.StatusCode(), checked.Body)
	})

	t.Run("should refuse generated credentials and a credential check when the role grants the action only for another folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		e.proj.NewRole(t, "credentials-reader", fixture.Permission{
			Subject:    "secret-rotation",
			Action:     []string{"read-generated-credentials"},
			Conditions: map[string]any{"secretPath": map[string]any{"$eq": "/elsewhere"}},
		})
		actor := e.proj.NewMachineIdentity(t, fixture.WithRoles("credentials-reader"))
		r := e.newRotation(t)

		// Action
		generated := r.generated(t, actor.API)
		checked := r.check(t, actor.API)

		// Assert
		requireStatus(t, http.StatusForbidden, generated.StatusCode(), generated.Body)
		require.NotContains(t, string(generated.Body), e.published(t, "/").password)
		requireStatus(t, http.StatusForbidden, checked.StatusCode(), checked.Body)
	})
}

func TestSecretRotation_License(t *testing.T) {
	t.Parallel()

	t.Run("should refuse create, update and rotate when the plan does not include secret rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		published := e.published(t, "/")
		a, aPw := e.target.NewRole(t)
		b, _ := e.target.NewRole(t)
		e.tn.SetPlan(t, license.Enterprise().Without(license.SecretRotation))
		description := "changed"

		// Action
		created := e.create(t, usernames(a, b), mapping("OTHER_USERNAME", "OTHER_PASSWORD"))
		updated := r.update(t, api.UpdatePostgreSQLCredentialsRotationJSONRequestBody{Description: &description})
		rotated := r.rotate(t)

		// Assert
		for _, res := range []struct {
			status int
			body   []byte
		}{{created.StatusCode(), created.Body}, {updated.StatusCode(), updated.Body}, {rotated.StatusCode(), rotated.Body}} {
			requireStatus(t, http.StatusBadRequest, res.status, res.body)
			require.Contains(t, apierr.Body(res.body), "plan restriction")
		}
		require.Equal(t, published, e.published(t, "/"))
		e.requireLogsIn(t, role{a, aPw}, "a user of the refused rotation")
		e.tn.SetPlan(t, license.Enterprise())
		got := r.view(t)
		require.Nil(t, got.Description)
		require.Equal(t, 0, got.ActiveIndex)
	})

	t.Run("should refuse listing and getting rotations and keep the mapped secrets readable when the plan does not include secret rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		published := e.published(t, "/")
		e.tn.SetPlan(t, license.Enterprise().Without(license.SecretRotation))

		// Action
		listed := e.list(t)
		got := r.get(t)

		// Assert
		requireStatus(t, http.StatusBadRequest, listed.StatusCode(), listed.Body)
		require.Contains(t, apierr.Body(listed.Body), "plan restriction")
		requireStatus(t, http.StatusBadRequest, got.StatusCode(), got.Body)
		require.Contains(t, apierr.Body(got.Body), "plan restriction")
		require.Equal(t, published, e.published(t, "/"))
	})

	t.Run("should still delete a rotation when the plan does not include secret rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t)
		e.tn.SetPlan(t, license.Enterprise().Without(license.SecretRotation))

		// Action
		res := r.delete(t, true, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, e.secretsAt(t, "/"))
		e.tn.SetPlan(t, license.Enterprise())
		require.Equal(t, http.StatusNotFound, r.get(t).StatusCode())
	})
}
