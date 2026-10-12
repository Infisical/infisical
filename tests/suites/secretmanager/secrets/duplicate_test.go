package secrets_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecret_Duplicate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should copy only the attributes asked for and leave the source untouched", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		created, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretValue: "value", SecretComment: new("rotate monthly"),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, created.StatusCode(), "creating returned %s", created.Body)
		source := secretmanager.GetSecret(t, proj, "dev", "API_KEY")
		body := api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []uuid.UUID{uuid.MustParse(source.ID)},
		}
		body.AttributesToCopy = &struct {
			Comment               *bool `json:"comment,omitempty"`
			Metadata              *bool `json:"metadata,omitempty"`
			SkipMultilineEncoding *bool `json:"skipMultilineEncoding,omitempty"`
			Tags                  *bool `json:"tags,omitempty"`
			Value                 *bool `json:"value,omitempty"`
		}{Value: new(true), Comment: new(false)}

		// Action
		res, err := tn.Admin.API.DuplicateSecretV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "duplicating returned %s", res.Body)
		copied := commentAndValue(t, tn.Admin.API, proj, "prod")
		require.Equal(t, [2]string{"", "value"}, copied, "the copy should carry the value but not the comment")
		require.Equal(t, [2]string{"rotate monthly", "value"}, commentAndValue(t, tn.Admin.API, proj, "dev"))
	})

	t.Run("should refuse duplicating into the same environment and path", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		source := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Action
		res, err := tn.Admin.API.DuplicateSecretV4WithResponse(t.Context(), api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "dev",
			SecretIds:              []uuid.UUID{uuid.MustParse(source.ID)},
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cannot duplicate secrets to the same environment and path", res.JSON400.Message)
		require.Len(t, secretmanager.ListSecrets(t, proj, "dev"), 1)
	})

	t.Run("should refuse and keep the destination when the name exists there without overwrite", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		source := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "from-dev")
		secretmanager.CreateSecret(t, proj, "prod", "API_KEY", "from-prod")

		// Action
		res, err := tn.Admin.API.DuplicateSecretV4WithResponse(t.Context(), api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []uuid.UUID{uuid.MustParse(source.ID)},
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret with key 'API_KEY' already exists at destination. Set shouldOverwrite to true to replace it.",
			res.JSON400.Message)
		require.Equal(t, "from-prod", secretmanager.GetSecret(t, proj, "prod", "API_KEY").Value)
	})

	t.Run("should refuse a secret that is not in the source folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		elsewhere := secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "value")

		// Action
		res, err := tn.Admin.API.DuplicateSecretV4WithResponse(t.Context(), api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []uuid.UUID{uuid.MustParse(elsewhere.ID)},
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf("Secret with ID '%s' not found in source folder with path '/' and environment slug 'dev'", elsewhere.ID),
			res.JSON404.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "prod"))
	})
}

func commentAndValue(t *testing.T, client *api.ClientWithResponses, proj *fixture.Project, env string) [2]string {
	t.Helper()
	res, err := client.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
		&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: &env})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading API_KEY in %s returned %d: %s", env, res.StatusCode(), res.Body)
	return [2]string{res.JSON200.Secret.SecretComment, res.JSON200.Secret.SecretValue}
}
