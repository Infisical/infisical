package tags_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretTag_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should strip the tag from secrets and keep the secrets when a tag is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		doomed, kept := secretmanager.CreateTag(t, proj, "doomed"), secretmanager.CreateTag(t, proj, "kept")
		createTaggedSecret(t, proj, "BOTH_TAGS", doomed, kept)
		createTaggedSecret(t, proj, "ONLY_DOOMED", doomed)

		// Action
		res, err := tn.Admin.API.DeleteSecretTagWithResponse(t.Context(), proj.ID, doomed)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the tag returned %s", res.Body)
		require.Equal(t, []string{"kept"}, slugsIn(t, proj))
		require.Equal(t, []string{"kept"}, tagsOn(t, proj, "BOTH_TAGS"))
		require.Empty(t, tagsOn(t, proj, "ONLY_DOOMED"))
		require.Len(t, secretmanager.ListSecrets(t, proj, "dev"), 2)
	})

	t.Run("should refuse a batch create naming an unknown tag id and create none of it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		known := secretmanager.CreateTag(t, proj, "known")
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue, body.Secrets[0].TagIds = "TAGGED", "v", &[]string{known}
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue, body.Secrets[1].TagIds = "UNKNOWN_TAG", "v", &[]string{uuid.NewString()}

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "batch create returned %s", res.Body)
		require.Equal(t, "Tag not found. Found known", apierr.Message(res.Body))
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})
}
