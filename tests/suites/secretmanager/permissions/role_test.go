package permissions_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestProjectRole_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// refused creates a role as the administrator, requires the status, checks the role
	// was not stored, and returns the body for the message.
	refused := func(t *testing.T, proj *fixture.Project, status int, slug string, permissions ...fixture.Permission) string {
		t.Helper()
		res := createRole(t, proj.Tenant().Admin, proj, slug, permissions...)
		require.Equalf(t, status, res.StatusCode(), "creating role %s: %s", slug, apierr.Body(res.Body))
		require.NotContains(t, roleSlugs(t, proj.Tenant().Admin, proj.ID), slug)
		return string(res.Body)
	}

	t.Run("should refuse read combined with read value or describe secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		body := refused(t, proj, http.StatusBadRequest, "mixed", allow("secrets", "read", "readValue"))

		// Assert
		require.Contains(t, body, "You have selected Read, and Read Value. You cannot select Read Value or Describe Secret if you "+
			"have selected Read. The Read permission is a legacy action which has been replaced by Describe Secret and Read Value.")
	})

	t.Run("should refuse a condition the action does not allow", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		body := refused(t, proj, http.StatusBadRequest, "bad-condition",
			allowWhere("identity", map[string]any{"identityId": "00000000-0000-0000-0000-000000000000"}, "create"))

		// Assert
		require.Contains(t, body, `Condition \"identityId\" is not allowed for action \"create\" on subject \"identity\"`)
	})

	t.Run("should refuse a secret path condition without a leading slash", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		body := refused(t, proj, http.StatusUnprocessableEntity, "no-slash",
			allowWhere("secrets", map[string]any{"secretPath": "app"}, "read"))

		// Assert
		require.Contains(t, body, "Invalid Secret Path; it must start with a '/'")
	})

	t.Run("should refuse a glob the matcher cannot parse", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		spec.Why(t, `picomatch accepts nearly any pattern; the one input it refuses to parse is one
			longer than its 64 KiB limit, so that is the only way to reach "Invalid glob pattern".`)
		tooLong := "/" + strings.Repeat("a", 64*1024+1)

		// Action
		body := refused(t, proj, http.StatusUnprocessableEntity, "bad-glob",
			allowWhere("secrets", map[string]any{"secretPath": map[string]any{"$glob": tooLong}}, "read"))

		// Assert
		require.Contains(t, body, "Invalid glob pattern")
	})

	t.Run("should refuse a duplicate slug and keep the first role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		proj.NewRole(t, "reader", allow("secrets", "read"))

		// Action
		res := createRole(t, proj.Tenant().Admin, proj, "reader", allow("secrets", "describeSecret", "create"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating a duplicate: %s", apierr.Body(res.Body))
		require.Equal(t, "Role with reader already exists", res.JSON400.Message)
		require.Equal(t, 1, countSlug(roleSlugs(t, proj.Tenant().Admin, proj.ID), "reader"))
	})

	t.Run("should refuse deleting a role in use with a message that names identities even when a user holds it", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		role := createRole(t, proj.Tenant().Admin, proj, "held", allow("secrets", "read"))
		require.NotNil(t, role.JSON200)
		proj.NewUser(t, fixture.WithPrincipalName("holder"), fixture.WithRoles("held"))

		// Action
		res, err := proj.Tenant().Admin.API.DeleteProjectRoleWithResponse(t.Context(), proj.ID, role.JSON200.Role.Id.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "deleting a role in use: %s", apierr.Body(res.Body))
		require.Equal(t, "Role is assigned to 1 identity membership. Re-assign membership role to delete this role.",
			res.JSON400.Message)
		require.Contains(t, roleSlugs(t, proj.Tenant().Admin, proj.ID), "held")
	})
}

func TestProjectRole_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	withoutRBAC := license.Enterprise().Without(license.RBAC)

	t.Run("should refuse a custom role create when the plan does not include rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutRBAC))
		proj := newProject(t, tn)

		// Action
		res := createRole(t, tn.Admin, proj, "reader", allow("secrets", "read"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating a role: %s", apierr.Body(res.Body))
		require.Equal(t, "Failed to create custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to create custom roles.",
			res.JSON400.Message)
		require.NotContains(t, roleSlugs(t, tn.Admin, proj.ID), "reader")
	})

	t.Run("should refuse a custom role update when the plan does not include rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		role := createRole(t, tn.Admin, proj, "reader", allow("secrets", "read"))
		require.NotNil(t, role.JSON200)
		tn.SetPlan(t, withoutRBAC)
		body, err := json.Marshal(map[string]any{"name": "renamed"})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.UpdateProjectRoleWithBodyWithResponse(t.Context(), proj.ID, role.JSON200.Role.Id.String(),
			"application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "updating a role: %s", apierr.Body(res.Body))
		require.Equal(t, "Failed to update custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to update custom roles.",
			res.JSON400.Message)
		got, err := tn.Admin.API.GetProjectRoleBySlugWithResponse(t.Context(), proj.ID, "reader")
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		require.Equal(t, "reader", got.JSON200.Role.Name)
	})

	t.Run("should keep an assigned custom role working after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		proj.NewRole(t, "reader", allow("secrets", "read"))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("reader"))
		tn.SetPlan(t, withoutRBAC)

		// Action
		got := listSecrets(t, reader, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing after the downgrade: %s", got.body)
		require.Equal(t, map[string]string{"API_KEY": "value"}, got.values)
	})

	t.Run("should still list and delete custom roles after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		role := createRole(t, tn.Admin, proj, "reader", allow("secrets", "read"))
		require.NotNil(t, role.JSON200)
		tn.SetPlan(t, withoutRBAC)

		// Action
		listed := roleSlugs(t, tn.Admin, proj.ID)
		res, err := tn.Admin.API.DeleteProjectRoleWithResponse(t.Context(), proj.ID, role.JSON200.Role.Id.String())

		// Assert
		require.NoError(t, err)
		require.Contains(t, listed, "reader")
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting after the downgrade: %s", apierr.Body(res.Body))
		require.NotContains(t, roleSlugs(t, tn.Admin, proj.ID), "reader")
	})
}

func countSlug(slugs []string, slug string) int {
	n := 0
	for _, s := range slugs {
		if s == slug {
			n++
		}
	}
	return n
}
