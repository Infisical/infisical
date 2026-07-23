//go:build integration

package nodejs

import "context"

// InviteToOrgRequest is the request body for POST /api/v1/invite-org/signup.
type InviteToOrgRequest struct {
	InviteeEmails  []string `json:"inviteeEmails"`
	OrganizationID string   `json:"organizationId"`
}

// AddUserToProjectRequest is the request body for POST /api/v1/projects/{id}/memberships.
type AddUserToProjectRequest struct {
	Usernames []string `json:"usernames"`
	RoleSlugs []string `json:"roleSlugs"`
}

// CreateUserPrivilegeRequest is the request body for POST /api/v1/user-project-additional-privilege.
type CreateUserPrivilegeRequest struct {
	ProjectMembershipID string        `json:"projectMembershipId"`
	Permissions         []Permission  `json:"permissions"`
	Type                PrivilegeType `json:"type"`
}

// UserSeed contains IDs for a user created via the Node.js API.
type UserSeed struct {
	ID    string
	Email string
	Token string // JWT access token for authentication
}

// UsersAPI groups user endpoints.
type UsersAPI struct{ apiBase }

// InviteAndCreate invites a user to the org and returns their seed. The invite
// creates the user record + org membership; the ID is read back from the DB
// since the invite response omits it.
func (a UsersAPI) InviteAndCreate(email string) *UserSeed {
	a.t.Helper()

	r, err := a.svc.client.R().
		SetAuthToken(a.svc.userToken).
		SetBody(InviteToOrgRequest{InviteeEmails: []string{email}, OrganizationID: a.svc.orgID}).
		Post("/api/v1/invite-org/signup")
	a.check("Users.InviteAndCreate", r, err)

	if a.svc.db == nil {
		a.t.Fatal("nodejs.Users.InviteAndCreate: db is nil, cannot query user ID")
	}
	var userID string
	if err := a.svc.db.Primary().QueryRow(context.Background(),
		`SELECT id FROM users WHERE username = $1`, email).Scan(&userID); err != nil {
		a.t.Fatalf("nodejs.Users.InviteAndCreate: query user ID: %v", err)
	}

	return &UserSeed{ID: userID, Email: email}
}

// AddToProject starts a user-to-project membership build keyed by email.
func (a UsersAPI) AddToProject(projectID, email string) *addUserBuilder {
	return &addUserBuilder{a: a, projectID: projectID, email: email}
}

type addUserBuilder struct {
	a         UsersAPI
	projectID string
	email     string
	roleSlugs []string
}

// Role appends a role slug to assign.
func (b *addUserBuilder) Role(slug string) *addUserBuilder {
	b.roleSlugs = append(b.roleSlugs, slug)
	return b
}

// Do assigns the configured roles.
func (b *addUserBuilder) Do() {
	b.a.t.Helper()
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(AddUserToProjectRequest{Usernames: []string{b.email}, RoleSlugs: b.roleSlugs}).
		Post("/api/v1/projects/" + b.projectID + "/memberships")
	b.a.check("Users.AddToProject", r, err)
}

// AdditionalPrivilege creates a permanent additional privilege for a user in a
// project. The project membership ID is resolved from the DB.
func (a UsersAPI) AdditionalPrivilege(userID, projectID string, permissions ...Permission) {
	a.t.Helper()

	if a.svc.db == nil {
		a.t.Fatal("nodejs.Users.AdditionalPrivilege: db is nil")
	}
	var membershipID string
	if err := a.svc.db.Primary().QueryRow(context.Background(),
		`SELECT id FROM memberships WHERE "actorUserId" = $1 AND "scopeProjectId" = $2 AND scope = 'project'`,
		userID, projectID).Scan(&membershipID); err != nil {
		a.t.Fatalf("nodejs.Users.AdditionalPrivilege: query membership ID: %v", err)
	}

	r, err := a.svc.client.R().
		SetAuthToken(a.svc.userToken).
		SetBody(CreateUserPrivilegeRequest{
			ProjectMembershipID: membershipID,
			Permissions:         permissions,
			Type:                PrivilegeType{IsTemporary: false},
		}).
		Post("/api/v1/user-project-additional-privilege/")
	a.check("Users.AdditionalPrivilege", r, err)
}
