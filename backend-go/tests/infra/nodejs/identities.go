//go:build integration

package nodejs

// CreateIdentityRequest is the request body for POST /api/v1/identities.
type CreateIdentityRequest struct {
	Name           string `json:"name"`
	OrganizationID string `json:"organizationId"`
	Role           string `json:"role"`
}

// CreateIdentityResponse is the response from POST /api/v1/identities.
type CreateIdentityResponse struct {
	Identity struct {
		ID string `json:"id"`
	} `json:"identity"`
}

// IdentitySeed contains IDs for a machine identity created via the Node.js API.
type IdentitySeed struct {
	ID   string
	Name string
}

// RoleAssignment represents a project role with optional temporary access.
type RoleAssignment struct {
	Role                     string `json:"role"`
	IsTemporary              bool   `json:"isTemporary,omitempty"`
	TemporaryMode            string `json:"temporaryMode,omitempty"`
	TemporaryRange           string `json:"temporaryRange,omitempty"`
	TemporaryAccessStartTime string `json:"temporaryAccessStartTime,omitempty"`
}

// AddIdentityToProjectWithRolesRequest is the request body with a roles array.
type AddIdentityToProjectWithRolesRequest struct {
	Roles []RoleAssignment `json:"roles"`
}

// PrivilegeType specifies whether an additional privilege is temporary. Shared by
// identity and user privilege requests.
type PrivilegeType struct {
	IsTemporary              bool   `json:"isTemporary"`
	TemporaryMode            string `json:"temporaryMode,omitempty"`
	TemporaryRange           string `json:"temporaryRange,omitempty"`
	TemporaryAccessStartTime string `json:"temporaryAccessStartTime,omitempty"`
}

// CreateIdentityPrivilegeRequest is the request body for POST /api/v2/identity-project-additional-privilege.
type CreateIdentityPrivilegeRequest struct {
	IdentityID  string        `json:"identityId"`
	ProjectID   string        `json:"projectId"`
	Permissions []Permission  `json:"permissions"`
	Type        PrivilegeType `json:"type"`
}

// IdentitiesAPI groups machine-identity endpoints.
type IdentitiesAPI struct{ apiBase }

// Create makes a no-access machine identity in the bootstrap org.
func (a IdentitiesAPI) Create(name string) *IdentitySeed {
	a.t.Helper()

	var resp CreateIdentityResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateIdentityRequest{Name: name, OrganizationID: a.svc.orgID, Role: "no-access"}).
		SetResult(&resp).
		Post("/api/v1/identities")
	a.check("Identities.Create", r, err)

	return &IdentitySeed{ID: resp.Identity.ID, Name: name}
}

// Delete removes a machine identity, revoking all its tokens.
func (a IdentitiesAPI) Delete(identityID string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		Delete("/api/v1/identities/" + identityID)
	a.check("Identities.Delete", r, err)
}

// AddToProject starts an identity-to-project membership build. Set at least one
// role via Role (simple) or Roles (explicit, e.g. temporary grants).
func (a IdentitiesAPI) AddToProject(projectID, identityID string) *addIdentityBuilder {
	return &addIdentityBuilder{a: a, projectID: projectID, identityID: identityID}
}

type addIdentityBuilder struct {
	a          IdentitiesAPI
	projectID  string
	identityID string
	roles      []RoleAssignment
}

// Role appends a simple permanent role by slug.
func (b *addIdentityBuilder) Role(slug string) *addIdentityBuilder {
	b.roles = append(b.roles, RoleAssignment{Role: slug})
	return b
}

// Roles appends explicit role assignments (e.g. temporary access).
func (b *addIdentityBuilder) Roles(roles ...RoleAssignment) *addIdentityBuilder {
	b.roles = append(b.roles, roles...)
	return b
}

// Do assigns the configured roles.
func (b *addIdentityBuilder) Do() {
	b.a.t.Helper()
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(AddIdentityToProjectWithRolesRequest{Roles: b.roles}).
		Post("/api/v1/projects/" + b.projectID + "/memberships/identities/" + b.identityID)
	b.a.check("Identities.AddToProject", r, err)
}

// AdditionalPrivilege starts an additional-privilege build for an identity.
// Call Temporary for a time-bound grant; otherwise it is permanent.
func (a IdentitiesAPI) AdditionalPrivilege(identityID, projectID string, permissions ...Permission) *identityPrivilegeBuilder {
	return &identityPrivilegeBuilder{a: a, identityID: identityID, projectID: projectID, permissions: permissions}
}

type identityPrivilegeBuilder struct {
	a           IdentitiesAPI
	identityID  string
	projectID   string
	permissions []Permission
	privType    PrivilegeType
}

// Temporary makes the privilege time-bound (relative mode).
func (b *identityPrivilegeBuilder) Temporary(temporaryRange, accessStartTime string) *identityPrivilegeBuilder {
	b.privType = PrivilegeType{
		IsTemporary:              true,
		TemporaryMode:            "relative",
		TemporaryRange:           temporaryRange,
		TemporaryAccessStartTime: accessStartTime,
	}
	return b
}

// Do creates the additional privilege.
func (b *identityPrivilegeBuilder) Do() {
	b.a.t.Helper()
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(CreateIdentityPrivilegeRequest{
			IdentityID:  b.identityID,
			ProjectID:   b.projectID,
			Permissions: b.permissions,
			Type:        b.privType,
		}).
		Post("/api/v2/identity-project-additional-privilege/")
	b.a.check("Identities.AdditionalPrivilege", r, err)
}
