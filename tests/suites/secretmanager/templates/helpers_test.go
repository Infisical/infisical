package templates_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// template is the part of a project template the tests read back. Decoded from the
// raw body because the generated response carries permission unions.
type template struct {
	ID           openapi_types.UUID `json:"id"`
	Name         string             `json:"name"`
	Description  *string            `json:"description"`
	Environments []struct {
		Slug string `json:"slug"`
	} `json:"environments"`
}

type role struct {
	Name        string           `json:"name"`
	Slug        string           `json:"slug"`
	Permissions []map[string]any `json:"permissions"`
}

func readSecretsRole(slug string) role {
	return role{Name: slug, Slug: slug, Permissions: []map[string]any{{"subject": "secrets", "action": []string{"read"}}}}
}

func env(name, slug string, position int) map[string]any {
	return map[string]any{"name": name, "slug": slug, "position": position}
}

// templateBody is a secret-manager template with a fresh name; fields override it.
func templateBody(fields map[string]any) map[string]any {
	body := map[string]any{"name": "tpl-" + id.Short(), "type": "secret-manager"}
	for k, v := range fields {
		body[k] = v
	}
	return body
}

func rawJSON(t *testing.T, body any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

func requestTemplate(t *testing.T, actor *harness.Principal, body map[string]any) *api.CreateProjectTemplateResponse {
	t.Helper()
	res, err := actor.API.CreateProjectTemplateWithBodyWithResponse(t.Context(), "application/json", rawJSON(t, body))
	require.NoError(t, err)
	return res
}

func newTemplate(t *testing.T, tn *harness.Tenant, body map[string]any) template {
	t.Helper()
	res := requestTemplate(t, tn.Admin, body)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating template returned %s", apierr.Body(res.Body))
	var reply struct {
		ProjectTemplate template `json:"projectTemplate"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &reply))
	return reply.ProjectTemplate
}

func getTemplate(t *testing.T, tn *harness.Tenant, templateID openapi_types.UUID) template {
	t.Helper()
	res, err := tn.Admin.API.GetProjectTemplateByIdWithResponse(t.Context(), templateID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading template returned %s", apierr.Body(res.Body))
	var reply struct {
		ProjectTemplate template `json:"projectTemplate"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &reply))
	return reply.ProjectTemplate
}

// templateNames lists the organization's own templates, leaving out the built-in
// default each project type has.
func templateNames(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListProjectTemplatesWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing templates returned %s", apierr.Body(res.Body))
	var reply struct {
		ProjectTemplates []struct {
			Name  string `json:"name"`
			OrgID string `json:"orgId"`
			ID    string `json:"id"`
		} `json:"projectTemplates"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &reply))
	names := []string{}
	for _, tpl := range reply.ProjectTemplates {
		if tpl.Name == "default" {
			continue
		}
		names = append(names, tpl.Name)
	}
	return names
}

type project struct {
	ID           string
	Environments []string
}

func requestProject(t *testing.T, actor *harness.Principal, templateName string) *api.CreateProjectResponse {
	t.Helper()
	kind := api.CreateProjectJSONBodyType("secret-manager")
	res, err := actor.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
		ProjectName: "p-" + id.Short(),
		Type:        &kind,
		Template:    &templateName,
	})
	require.NoError(t, err)
	return res
}

func newProjectFrom(t *testing.T, actor *harness.Principal, templateName string) project {
	t.Helper()
	res := requestProject(t, actor, templateName)
	require.NotNilf(t, res.JSON200, "creating a project from %s returned %d: %s", templateName, res.StatusCode(), apierr.Body(res.Body))
	p := project{ID: res.JSON200.Project.Id}
	for _, e := range res.JSON200.Project.Environments {
		p.Environments = append(p.Environments, e.Slug)
	}
	return p
}

func projectCount(t *testing.T, tn *harness.Tenant) int {
	t.Helper()
	res, err := tn.Admin.API.ListProjectsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing projects returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return len(res.JSON200.Projects)
}

func roleSlug(role string, custom *string) string {
	if role == "custom" && custom != nil {
		return *custom
	}
	return role
}

func userRoles(t *testing.T, tn *harness.Tenant, projectID string, user *harness.Principal) []string {
	t.Helper()
	res, err := tn.Admin.API.ListProjectMembershipsWithResponse(t.Context(), projectID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing memberships returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, m := range res.JSON200.Memberships {
		if m.UserId != user.ID {
			continue
		}
		roles := []string{}
		for _, r := range m.Roles {
			roles = append(roles, roleSlug(r.Role, r.CustomRoleSlug))
		}
		return roles
	}
	return nil
}
