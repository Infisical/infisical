//go:build integration

package nodejs

import "fmt"

// CreateGroupRequest is the request body for POST /api/v1/groups.
type CreateGroupRequest struct {
	Name string `json:"name"`
	Role string `json:"role"`
}

// CreateGroupResponse is the response from POST /api/v1/groups.
type CreateGroupResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// AddGroupToProjectRequest is the request body for POST /api/v1/projects/{id}/memberships/groups/{id}.
type AddGroupToProjectRequest struct {
	Role string `json:"role"`
}

// GroupSeed contains metadata for an org group created via the Node.js API.
type GroupSeed struct {
	ID   string
	Name string
	Slug string
}

// GroupsAPI groups org-group endpoints. Requires the "groups" EE feature.
type GroupsAPI struct{ apiBase }

// Create makes a no-access org group.
func (a GroupsAPI) Create(name string) *GroupSeed {
	a.t.Helper()

	var resp CreateGroupResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateGroupRequest{Name: name, Role: "no-access"}).
		SetResult(&resp).
		Post("/api/v1/groups")
	a.check("Groups.Create", r, err)

	return &GroupSeed{ID: resp.ID, Name: resp.Name, Slug: resp.Slug}
}

// AddUser adds a user (by username/email) to a group. Uses the admin user JWT
// because group member management runs privilege-boundary checks.
func (a GroupsAPI) AddUser(groupID, username string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.userToken).
		SetHeader("Content-Type", "application/json").
		SetBody(struct{}{}).
		Post(fmt.Sprintf("/api/v1/groups/%s/users/%s", groupID, username))
	a.check("Groups.AddUser", r, err)
}

// AddToProject adds a group to a project with the given role.
func (a GroupsAPI) AddToProject(projectID, groupID, role string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(AddGroupToProjectRequest{Role: role}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/groups/%s", projectID, groupID))
	a.check("Groups.AddToProject", r, err)
}
