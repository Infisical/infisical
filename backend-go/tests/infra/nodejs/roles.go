//go:build integration

package nodejs

import "fmt"

// Permission represents a CASL permission rule. Shared by custom roles and
// additional privileges.
type Permission struct {
	Subject    string         `json:"subject"`
	Action     any            `json:"action"`
	Conditions map[string]any `json:"conditions,omitempty"`
	Inverted   bool           `json:"inverted,omitempty"`
}

// CreateCustomRoleRequest is the request body for POST /api/v1/projects/{id}/roles.
type CreateCustomRoleRequest struct {
	Slug        string       `json:"slug"`
	Name        string       `json:"name"`
	Permissions []Permission `json:"permissions"`
}

// CreateCustomRoleResponse is the response from POST /api/v1/projects/{id}/roles.
type CreateCustomRoleResponse struct {
	Role struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
		Name string `json:"name"`
	} `json:"role"`
}

// CustomRoleSeed contains metadata for a custom project role.
type CustomRoleSeed struct {
	ID   string
	Slug string
	Name string
}

// RolesAPI groups custom project role endpoints. Requires the "rbac" EE feature.
type RolesAPI struct{ apiBase }

// CreateCustom creates a custom project role with the given permissions.
func (a RolesAPI) CreateCustom(projectID, slug, name string, permissions ...Permission) *CustomRoleSeed {
	a.t.Helper()

	var resp CreateCustomRoleResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateCustomRoleRequest{Slug: slug, Name: name, Permissions: permissions}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/roles", projectID))
	a.check("Roles.CreateCustom", r, err)

	return &CustomRoleSeed{ID: resp.Role.ID, Slug: resp.Role.Slug, Name: resp.Role.Name}
}
