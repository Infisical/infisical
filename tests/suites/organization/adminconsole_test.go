package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAdminConsole_ProjectAccess(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should make an org admin a project admin and mail the project's other admins", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		orgAdmin := tn.NewUser(t, harness.OrgRole("admin"))

		// Action
		res, err := orgAdmin.API.GrantOrganizationAdminProjectAccessWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []string{"admin"}, projectRoleSlugs(t, tn, proj, orgAdmin))
		msg := tn.Mail(t).Expect(t, tn.Admin.Email, smtp.Subject("Organization Admin Project Direct Access Issued"))
		require.Contains(t, msg.Body, orgAdmin.Email)
		require.Contains(t, msg.Body, proj.Name)
	})

	t.Run("should refuse listing all projects to a member without access-all-projects", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.ListOrganizationProjectsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	t.Run("should refuse self-granted project access to a member without access-all-projects and add no membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.GrantOrganizationAdminProjectAccessWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotContains(t, projectMemberEmails(t, tn, proj), member.Email)
	})

	t.Run("should let a custom role with access-all-projects list every project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		console := customRoleUser(t, tn, "console",
			fixture.Permission{Subject: "organization-admin-console", Action: []string{"access-all-projects"}})

		// Action
		res, err := console.API.ListOrganizationProjectsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		var ids []string
		for _, p := range res.JSON200.Projects {
			ids = append(ids, p.Id)
		}
		require.Contains(t, ids, proj.ID)
	})
}

// projectRoleSlugs is the role slugs the user holds directly in the project.
func projectRoleSlugs(t *testing.T, tn *harness.Tenant, proj *fixture.Project, user *harness.Principal) []string {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListProjectMembershipsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	for _, m := range res.JSON200.Memberships {
		if m.UserId != user.ID {
			continue
		}
		var out []string
		for _, r := range m.Roles {
			out = append(out, r.Role)
		}
		return out
	}
	t.Fatalf("%s is not a member of project %s", user.Email, proj.ID)
	return nil
}
