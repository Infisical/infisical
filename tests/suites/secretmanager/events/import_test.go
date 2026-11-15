package events_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestProjectEvents_ImportMutation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stream an import mutation for the folder an import is added to", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:import-mutation"))

		// Action
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"})

		// Assert
		ev := s.next(t)
		require.Equal(t, "secret:import-mutation", ev.Type)
		require.Equal(t, folderRef{"dev", "/"}, ev.folder(t))
	})

	t.Run("should stream an import mutation for the importing folder when an imported secret changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/shared")
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/shared"},
			secretmanager.IntoPath("/app"))
		s := watch(t, proj, on("secret:import-mutation").in("dev", "/app"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "SHARED_KEY", "value", secretmanager.WithPath("/shared"))

		// Assert
		require.Equal(t, folderRef{"dev", "/app"}, s.next(t).folder(t))
	})

	t.Run("should stream an import mutation for both folders when a secret is moved", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/app")
		moved := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		s := watch(t, proj, on("secret:import-mutation"))

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			DestinationSecretPath:  new("/app"),
			SecretIds:              []string{moved.ID},
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.ElementsMatch(t, []folderRef{{"dev", "/"}, {"prod", "/app"}},
			[]folderRef{s.next(t).folder(t), s.next(t).folder(t)})
	})
}
