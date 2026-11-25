package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

const customRolesRefused = "Certificate Manager does not support custom roles. Use the built-in Admin or Member role."

func TestCertManagerAccess_Roles(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the built-in admin and member roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.ListCertManagerRolesWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing roles returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var slugs []string
		for _, r := range res.JSON200.Roles {
			slugs = append(slugs, r.Slug)
		}
		require.ElementsMatch(t, []string{"admin", "member"}, slugs)
	})

	t.Run("should read the member role by slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetCertManagerRoleBySlugWithResponse(t.Context(), "member")

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the role returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "member", res.JSON200.Role.Slug)
		require.Equal(t, new("Access scoped to the Applications and Code Signers they've been added to"), res.JSON200.Role.Description)
	})

	t.Run("should refuse to create a custom role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateCertManagerRoleWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, customRolesRefused, apierr.Message(res.Body))
	})

	t.Run("should refuse to edit or delete a built-in role and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		role, err := tn.Admin.API.GetCertManagerRoleBySlugWithResponse(t.Context(), "admin")
		require.NoError(t, err)
		require.NotNil(t, role.JSON200)

		// Action
		upd, err := tn.Admin.API.UpdateCertManagerRoleWithResponse(t.Context(), role.JSON200.Role.Id)
		require.NoError(t, err)
		del, err := tn.Admin.API.DeleteCertManagerRoleWithResponse(t.Context(), role.JSON200.Role.Id)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusBadRequest, upd.StatusCode(), "updating answered: %s", apierr.Body(upd.Body))
		require.Equal(t, customRolesRefused, apierr.Message(upd.Body))
		require.Equalf(t, http.StatusBadRequest, del.StatusCode(), "deleting answered: %s", apierr.Body(del.Body))
		require.Equal(t, customRolesRefused, apierr.Message(del.Body))
		again, err := tn.Admin.API.GetCertManagerRoleBySlugWithResponse(t.Context(), "admin")
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, again.StatusCode())
	})
}
