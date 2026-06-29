//go:build integration

package nodejs

import "fmt"

// CreateEnvironmentRequest is the request body for POST /api/v1/projects/{id}/environments.
type CreateEnvironmentRequest struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// CreateEnvironmentResponse is the response from POST /api/v1/projects/{id}/environments.
type CreateEnvironmentResponse struct {
	Environment struct {
		ID string `json:"id"`
	} `json:"environment"`
}

// EnvironmentSeed contains metadata for an environment created via the Node.js API.
type EnvironmentSeed struct {
	ID   string
	Slug string
	Name string
}

// EnvironmentsAPI groups project environment endpoints.
type EnvironmentsAPI struct{ apiBase }

// Create adds an environment to a project.
func (a EnvironmentsAPI) Create(projectID, slug, name string) *EnvironmentSeed {
	a.t.Helper()

	var resp CreateEnvironmentResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateEnvironmentRequest{Slug: slug, Name: name}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/environments", projectID))
	a.check("Environments.Create", r, err)

	return &EnvironmentSeed{ID: resp.Environment.ID, Slug: slug, Name: name}
}

// SoftDelete marks an environment for deletion (recoverable) rather than removing
// it immediately.
func (a EnvironmentsAPI) SoftDelete(projectID, envID string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		Delete(fmt.Sprintf("/api/v1/projects/%s/environments/%s", projectID, envID))
	a.check("Environments.SoftDelete", r, err)
}
