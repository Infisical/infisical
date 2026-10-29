package tags_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretTag_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a duplicate slug and keep one tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateTag(t, proj, "backend")

		// Action
		res, err := tn.Admin.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
			api.CreateSecretTagJSONRequestBody{Slug: "backend", Color: "#000000"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating a duplicate returned %s", res.Body)
		require.Equal(t, "Tag already exists", apierr.Message(res.Body))
		require.Equal(t, []string{"backend"}, slugsIn(t, proj))
	})

	t.Run("should refuse a slug that is not lowercase letters, numbers and hyphens", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
			api.CreateSecretTagJSONRequestBody{Slug: "Back End", Color: "#000000"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "creating an invalid slug returned %s", res.Body)
		require.Contains(t, string(res.Body), "Slug field can only contain lowercase letters, numbers, and hyphens")
		require.Empty(t, slugsIn(t, proj))
	})

	t.Run("should refuse a viewer creating a tag", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
			api.CreateSecretTagJSONRequestBody{Slug: "backend", Color: "#000000"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "a viewer creating a tag returned %s", res.Body)
		require.Empty(t, slugsIn(t, proj))
	})
}

func TestSecretTag_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an update onto another tag's slug and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateTag(t, proj, "backend")
		frontend := secretmanager.CreateTag(t, proj, "frontend")

		// Action
		res, err := tn.Admin.API.UpdateSecretTagWithResponse(t.Context(), proj.ID, frontend,
			api.UpdateSecretTagJSONRequestBody{Slug: "backend", Color: "#000000"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "renaming onto a taken slug returned %s", res.Body)
		require.Equal(t, "Tag already exists", apierr.Message(res.Body))
		require.Equal(t, []string{"backend", "frontend"}, slugsIn(t, proj))
	})
}

func TestSecretTag_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return a tag by slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		id := secretmanager.CreateTag(t, proj, "backend")
		secretmanager.CreateTag(t, proj, "frontend")

		// Action
		res, err := tn.Admin.API.GetSecretTagBySlugWithResponse(t.Context(), proj.ID, "backend")

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading by slug returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, id, res.JSON200.Tag.Id.String())
		require.Equal(t, "backend", res.JSON200.Tag.Slug)
		require.Equal(t, proj.ID, res.JSON200.Tag.ProjectId)
	})

	t.Run("should return not found for an unknown id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		unknown := uuid.NewString()

		// Action
		res, err := tn.Admin.API.GetSecretTagByIdWithResponse(t.Context(), proj.ID, unknown)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "reading an unknown tag returned %s", res.Body)
		require.Equal(t, fmt.Sprintf("Tag with ID '%s' not found", unknown), apierr.Message(res.Body))
	})
}
