package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_Move(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should move the secret to the destination and remove it from the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/app")
		moved := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

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
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), res.Body)
		require.True(t, res.JSON200.IsSourceUpdated)
		require.True(t, res.JSON200.IsDestinationUpdated)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "prod", "API_KEY", secretmanager.WithPath("/app")).Value)
	})

	t.Run("should refuse and move nothing when the destination holds a different value without overwrite", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		moved := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "from-dev")
		secretmanager.CreateSecret(t, proj, "prod", "API_KEY", "from-prod")

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []string{moved.ID},
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to move secrets. The following secrets already exist in the destination: API_KEY", res.JSON400.Message)
		require.Equal(t, "from-dev", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
		require.Equal(t, "from-prod", secretmanager.GetSecret(t, proj, "prod", "API_KEY").Value)
	})

	t.Run("should replace the destination value when overwrite is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		moved := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "from-dev")
		secretmanager.CreateSecret(t, proj, "prod", "API_KEY", "from-prod")

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []string{moved.ID},
			ShouldOverwrite:        new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "moving returned %s", res.Body)
		require.Equal(t, "from-dev", secretmanager.GetSecret(t, proj, "prod", "API_KEY").Value)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse and move nothing when the destination folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		moved := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			DestinationSecretPath:  new("/missing"),
			SecretIds:              []string{moved.ID},
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Destination folder with path '/missing' in environment with slug 'prod' not found", res.JSON404.Message)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})
}
