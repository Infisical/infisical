package templates_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestProjectTemplate_Permissions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an org member without the template permissions and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res := requestTemplate(t, member, templateBody(nil))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse an org member creating a project from a template and create no project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(nil))
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res := requestProject(t, member, tpl.Name)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		listed, err := member.API.ListProjectsWithResponse(t.Context(), nil)
		require.NoError(t, err)
		require.NotNil(t, listed.JSON200)
		require.Empty(t, listed.JSON200.Projects)
	})
}

func TestProjectTemplate_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	withoutTemplates := license.Enterprise().Without(license.ProjectTemplates)

	t.Run("should refuse creating a template when the plan does not include templates", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutTemplates))

		// Action
		res := requestTemplate(t, tn.Admin, templateBody(nil))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to create project template due to plan restriction. Upgrade plan to access project templates.", res.JSON400.Message)
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, templateNames(t, tn))
	})

	t.Run("should refuse updating a template after a downgrade and keep it unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{"description": "before"}))
		tn.SetPlan(t, withoutTemplates)

		// Action
		res, err := tn.Admin.API.UpdateProjectTemplateWithBodyWithResponse(t.Context(), tpl.ID, "application/json",
			rawJSON(t, map[string]any{"description": "after"}))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to update project template due to plan restriction. Upgrade plan to access project templates.", res.JSON400.Message)
		tn.SetPlan(t, license.Enterprise())
		require.Equal(t, "before", *getTemplate(t, tn, tpl.ID).Description)
	})

	t.Run("should refuse listing, reading and deleting templates after a downgrade and keep them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(nil))
		tn.SetPlan(t, withoutTemplates)

		// Action
		deleted, err := tn.Admin.API.DeleteProjectTemplateWithResponse(t.Context(), tpl.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, deleted.StatusCode())
		require.Equal(t, "Failed to delete project template due to plan restriction. Upgrade plan to access project templates.", deleted.JSON400.Message)
		listed, err := tn.Admin.API.ListProjectTemplatesWithResponse(t.Context(), nil)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, listed.StatusCode())
		got, err := tn.Admin.API.GetProjectTemplateByIdWithResponse(t.Context(), tpl.ID)
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, got.StatusCode())
		tn.SetPlan(t, license.Enterprise())
		require.Equal(t, []string{tpl.Name}, templateNames(t, tn))
	})

	t.Run("should refuse creating a project from an existing template after a downgrade and create no project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(nil))
		before := projectCount(t, tn)
		tn.SetPlan(t, withoutTemplates)

		// Action
		res := requestProject(t, tn.Admin, tpl.Name)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to access project template due to plan restriction. Upgrade plan to access project templates.", res.JSON400.Message)
		require.Equal(t, before, projectCount(t, tn))
	})
}
