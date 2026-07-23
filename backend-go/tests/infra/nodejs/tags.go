//go:build integration

package nodejs

import "fmt"

// CreateTagRequest is the request body for POST /api/v1/projects/{id}/tags.
type CreateTagRequest struct {
	Slug  string `json:"slug"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// CreateTagResponse is the response from POST /api/v1/projects/{id}/tags.
type CreateTagResponse struct {
	Tag struct {
		ID string `json:"id"`
	} `json:"tag"`
}

// TagSeed contains metadata for a tag created via the Node.js API.
type TagSeed struct {
	ID   string
	Slug string
	Name string
}

// TagsAPI groups project tag endpoints.
type TagsAPI struct{ apiBase }

// Create makes a project tag.
func (a TagsAPI) Create(projectID, slug, name, color string) *TagSeed {
	a.t.Helper()

	var resp CreateTagResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateTagRequest{Slug: slug, Name: name, Color: color}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/tags", projectID))
	a.check("Tags.Create", r, err)

	return &TagSeed{ID: resp.Tag.ID, Slug: slug, Name: name}
}
