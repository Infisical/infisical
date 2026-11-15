package events_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestProjectEvents_Stream(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stream a create, an update and a delete with the secret each one changed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:create"), on("secret:update"), on("secret:delete"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_URL", "second")
		secretmanager.DeleteSecret(t, proj, "dev", "DB_URL")

		// Assert
		for _, want := range []string{"secret:create", "secret:update", "secret:delete"} {
			ev := s.next(t)
			require.Equal(t, want, ev.Name)
			require.Equal(t, want, ev.Type)
			require.Equal(t, "secret-manager", ev.ProjectType)
			require.Equal(t, []secretRef{{"dev", "/", "DB_URL"}}, ev.secrets(t))
		}
	})

	t.Run("should stream one event naming every secret of a batch create", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:create"))
		batch := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		batch.Secrets = slices.Grow(batch.Secrets, 2)[:2]
		batch.Secrets[0].SecretKey, batch.Secrets[0].SecretValue = "DB_URL", "a"
		batch.Secrets[1].SecretKey, batch.Secrets[1].SecretValue = "API_KEY", "b"

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(), batch)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch create: %s", apierr.Body(res.Body))
		require.ElementsMatch(t, []secretRef{{"dev", "/", "DB_URL"}, {"dev", "/", "API_KEY"}}, s.next(t).secrets(t))
	})

	t.Run("should not stream a personal override", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "shared")
		s := watch(t, proj, on("secret:create"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "mine", secretmanager.WithPersonal())
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "shared")

		// Assert
		require.Equal(t, []secretRef{{"dev", "/", "API_KEY"}}, s.next(t).secrets(t))
	})
}
