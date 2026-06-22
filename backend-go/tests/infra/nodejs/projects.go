//go:build integration

package nodejs

import (
	"crypto/rand"
	"fmt"
)

// CreateProjectRequest is the request body for POST /api/v1/projects.
type CreateProjectRequest struct {
	ProjectName string `json:"projectName"`
	Slug        string `json:"slug"`
	Type        string `json:"type"`
}

// CreateProjectResponse is the response from POST /api/v1/projects.
type CreateProjectResponse struct {
	Project struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	} `json:"project"`
}

// ProjectSeed contains IDs for a project created via the Node.js API.
type ProjectSeed struct {
	ID      string
	Slug    string
	EnvSlug string
}

// ProjectsAPI groups project endpoints.
type ProjectsAPI struct{ apiBase }

// Create starts a secret-manager project build. The slug is random unless set.
// On Do the creating identity becomes admin and the bootstrap user is added as
// admin too, so either can be used for subsequent API calls.
func (a ProjectsAPI) Create(name string) *createProjectBuilder {
	return &createProjectBuilder{a: a, name: name}
}

type createProjectBuilder struct {
	a    ProjectsAPI
	name string
	slug string
}

// Slug overrides the auto-generated project slug.
func (b *createProjectBuilder) Slug(slug string) *createProjectBuilder {
	b.slug = slug
	return b
}

// Do creates the project and returns its seed.
func (b *createProjectBuilder) Do() *ProjectSeed {
	b.a.t.Helper()

	slug := b.slug
	if slug == "" {
		raw := make([]byte, 4)
		rand.Read(raw)
		slug = fmt.Sprintf("t-%s-%x", b.name, raw)
		if len(slug) > 36 {
			slug = slug[:36]
		}
	}

	var resp CreateProjectResponse
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(CreateProjectRequest{ProjectName: b.name, Slug: slug, Type: "secret-manager"}).
		SetResult(&resp).
		Post("/api/v1/projects")
	b.a.check("Projects.Create", r, err)

	projectID := resp.Project.ID

	// Add bootstrap user to project as admin (identity is already admin as creator).
	r, err = b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(AddUserToProjectRequest{Usernames: []string{b.a.svc.userEmail}, RoleSlugs: []string{"admin"}}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships", projectID))
	b.a.check("Projects.Create(add user)", r, err)

	return &ProjectSeed{ID: projectID, Slug: resp.Project.Slug, EnvSlug: "dev"}
}

// Delete removes a project.
func (a ProjectsAPI) Delete(projectID string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		Delete("/api/v1/projects/" + projectID)
	a.check("Projects.Delete", r, err)
}
