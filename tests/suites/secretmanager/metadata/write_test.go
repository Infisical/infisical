package metadata_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretMetadata_Write(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	create := func(t *testing.T, proj *fixture.Project, metadata entry) *api.CreateSecretV4Response {
		t.Helper()
		res, err := proj.Tenant().Admin.API.CreateSecretV4WithResponse(t.Context(), "LABELLED", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretValue: "v", SecretMetadata: &[]entry{metadata},
		})
		require.NoError(t, err)
		return res
	}

	t.Run("should refuse a metadata key over 255 characters and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		res := create(t, proj, plain(strings.Repeat("k", 256), "v"))

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "creating returned %s", res.Body)
		require.Contains(t, string(res.Body), "String must contain at most 255 character(s)")
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse a metadata value over 1020 characters and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		res := create(t, proj, plain("k", strings.Repeat("v", 1021)))

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "creating returned %s", res.Body)
		require.Contains(t, string(res.Body), "String must contain at most 1020 character(s)")
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should replace the metadata set on update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		createWithMetadata(t, proj, "LABELLED", plain("dropped", "1"), plain("changed", "2"))
		replacement := []entry{plain("changed", "3"), plain("added", "4")}

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "LABELLED", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretMetadata: &replacement,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating returned %s", res.Body)
		require.Equal(t, map[string]string{"changed": "3", "added": "4"}, metadataOf(t, proj, "LABELLED"))
	})
}
