//go:build integration

package infra

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"testing"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/google/uuid"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/infisical/api/internal/database/pg"
)

// ProjectSeed contains IDs for a project created via the Node.js API.
type ProjectSeed struct {
	ID      string
	Slug    string
	EnvSlug string
}

// IdentitySeed contains IDs for a machine identity created via the Node.js API.
type IdentitySeed struct {
	ID   string
	Name string
}

// CustomRoleSeed contains metadata for a custom project role created via the Node.js API.
type CustomRoleSeed struct {
	ID   string
	Slug string
	Name string
}

// GroupSeed contains metadata for an org group created via the Node.js API.
type GroupSeed struct {
	ID   string
	Name string
	Slug string
}

// UserSeed contains IDs for a user created via the Node.js API.
type UserSeed struct {
	ID    string
	Email string
	Token string // JWT access token for authentication
}

// NodeJSService provides access to a running Node.js backend container
// and the bootstrapped credentials (admin user, org, machine identity).
type NodeJSService struct {
	container     testcontainers.Container
	url           string
	client        *resty.Client
	db            pg.DB
	orgID         string
	userID        string
	userEmail     string
	identityToken string
	userToken     string
}

func (n *NodeJSService) URL() string           { return n.url }
func (n *NodeJSService) OrgID() string         { return n.orgID }
func (n *NodeJSService) UserID() string        { return n.userID }
func (n *NodeJSService) UserEmail() string     { return n.userEmail }
func (n *NodeJSService) IdentityToken() string { return n.identityToken }
func (n *NodeJSService) UserToken() string     { return n.userToken }
func (n *NodeJSService) Client() *resty.Client { return n.client }

func startNodeJS(ctx context.Context, networkName string, files []testcontainers.ContainerFile, cmd []string) (*NodeJSService, error) {
	// When a custom Cmd is provided (e.g. for patching files via sed), we need
	// to run as root because the container image sets USER non-root-user which
	// cannot write to root-owned paths like /backend/dist/.
	user := ""
	if len(cmd) > 0 {
		user = "root"
	}

	req := testcontainers.ContainerRequest{
		Image:        "infisical/infisical:latest",
		ExposedPorts: []string{"8080/tcp"},
		Networks:     []string{networkName},
		NetworkAliases: map[string][]string{
			networkName: {"backend-nodejs"},
		},
		User: user,
		Env: map[string]string{
			"NODE_ENV":          "development",
			"DB_CONNECTION_URI": fmt.Sprintf("postgres://%s:%s@db:5432/%s?sslmode=disable", pgUser, pgPassword, pgDB),
			"REDIS_URL":         "redis://redis:6379",
			"ENCRYPTION_KEY":    EncryptionKey,
			"AUTH_SECRET":       AuthSecret,
			"SITE_URL":          "http://localhost:8080",
			"TELEMETRY_ENABLED": "false",
			"SMTP_HOST":         "",
		},
		Files:      files,
		Cmd:        cmd,
		WaitingFor: wait.ForHTTP("/api/status").WithPort("8080/tcp").WithStartupTimeout(120 * time.Second),
	}

	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, fmt.Errorf("starting nodejs: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting nodejs host: %w", err)
	}

	mappedPort, err := container.MappedPort(ctx, "8080/tcp")
	if err != nil {
		return nil, fmt.Errorf("getting nodejs port: %w", err)
	}

	baseURL := fmt.Sprintf("http://%s:%d", host, mappedPort.Int())

	return &NodeJSService{
		container: container,
		url:       baseURL,
		client:    resty.New().SetBaseURL(baseURL),
	}, nil
}

// bootstrap creates the initial admin user, org, and machine identity,
// then logs in to obtain a user JWT. Uses log.Fatalf since it runs in TestMain.
func (n *NodeJSService) bootstrap() {
	var bootstrapResp BootstrapResponse
	resp, err := n.client.R().
		SetBody(BootstrapRequest{
			Email:        "test-admin@example.com",
			Password:     "testpassword123",
			Organization: "test-org",
		}).
		SetResult(&bootstrapResp).
		Post("/api/v1/admin/bootstrap")
	if err != nil {
		log.Fatalf("infra.bootstrap: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: returned %d: %s", resp.StatusCode(), resp.String())
	}

	n.orgID = bootstrapResp.Organization.ID
	n.identityToken = bootstrapResp.Identity.Credentials.Token
	n.userEmail = bootstrapResp.User.Email
	n.userID = bootstrapResp.User.ID

	var loginResp LoginResponse
	resp, err = n.client.R().
		SetBody(LoginRequest{
			Email:    n.userEmail,
			Password: "testpassword123",
		}).
		SetResult(&loginResp).
		Post("/api/v3/auth/login")
	if err != nil {
		log.Fatalf("infra.bootstrap: login request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: login returned %d: %s", resp.StatusCode(), resp.String())
	}

	// Select organization to get an org-scoped JWT (required for org-level API calls).
	var selectOrgResp SelectOrgResponse
	resp, err = n.client.R().
		SetHeader("Authorization", "Bearer "+loginResp.AccessToken).
		SetBody(SelectOrgRequest{
			OrganizationID: n.orgID,
		}).
		SetResult(&selectOrgResp).
		Post("/api/v3/auth/select-organization")
	if err != nil {
		log.Fatalf("infra.bootstrap: select-org request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: select-org returned %d: %s", resp.StatusCode(), resp.String())
	}
	n.userToken = selectOrgResp.Token
}

// MustCreateProject creates a new project via the Node.js API.
// Safe to call from TestMain — uses log.Fatalf on error.
func (n *NodeJSService) MustCreateProject(name string) *ProjectSeed {
	var projectResp CreateProjectResponse
	resp, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateProjectRequest{
			ProjectName: name,
			Slug:        fmt.Sprintf("test-%s", name),
			Type:        "secret-manager",
		}).
		SetResult(&projectResp).
		Post("/api/v1/projects")
	if err != nil {
		log.Fatalf("infra.MustCreateProject: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.MustCreateProject: returned %d: %s", resp.StatusCode(), resp.String())
	}

	return &ProjectSeed{
		ID:      projectResp.Project.ID,
		Slug:    projectResp.Project.Slug,
		EnvSlug: "dev",
	}
}

// CreateProject creates a new project via the Node.js API and returns its metadata.
// The bootstrap identity creates the project (automatically becoming admin), then the
// bootstrap user is also added as admin so both can be used for API calls.
func (n *NodeJSService) CreateProject(t *testing.T, name string) *ProjectSeed {
	t.Helper()

	b := make([]byte, 4)
	rand.Read(b)
	slug := fmt.Sprintf("t-%s-%x", name, b)
	if len(slug) > 36 {
		slug = slug[:36]
	}

	var projectResp CreateProjectResponse
	resp, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateProjectRequest{
			ProjectName: name,
			Slug:        slug,
			Type:        "secret-manager",
		}).
		SetResult(&projectResp).
		Post("/api/v1/projects")
	if err != nil {
		t.Fatalf("infra.CreateProject: request failed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("infra.CreateProject: returned %d: %s", resp.StatusCode(), resp.String())
	}

	projectID := projectResp.Project.ID

	// Add bootstrap user to project as admin (identity is already admin as creator)
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(AddUserToProjectRequest{
			Usernames: []string{n.userEmail},
			RoleSlugs: []string{"admin"},
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships", projectID))
	if err != nil {
		t.Fatalf("infra.CreateProject: add user failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateProject: add user returned %d: %s", r.StatusCode(), r.String())
	}

	return &ProjectSeed{
		ID:      projectID,
		Slug:    projectResp.Project.Slug,
		EnvSlug: "dev",
	}
}

// DeleteProject deletes a project via the Node.js API.
func (n *NodeJSService) DeleteProject(t *testing.T, projectID string) {
	t.Helper()

	resp, err := n.client.R().
		SetAuthToken(n.identityToken).
		Delete("/api/v1/projects/" + projectID)
	if err != nil {
		t.Fatalf("infra.DeleteProject: request failed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("infra.DeleteProject: returned %d: %s", resp.StatusCode(), resp.String())
	}
}

// CreateIdentity creates a new machine identity in the bootstrap org.
func (n *NodeJSService) CreateIdentity(t *testing.T, name string) *IdentitySeed {
	t.Helper()

	var resp CreateIdentityResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateIdentityRequest{
			Name:           name,
			OrganizationID: n.orgID,
			Role:           "no-access",
		}).
		SetResult(&resp).
		Post("/api/v1/identities")
	if err != nil {
		t.Fatalf("infra.CreateIdentity: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateIdentity: returned %d: %s", r.StatusCode(), r.String())
	}

	return &IdentitySeed{
		ID:   resp.Identity.ID,
		Name: name,
	}
}

// DeleteIdentity deletes a machine identity. This also revokes all tokens for the identity.
func (n *NodeJSService) DeleteIdentity(t *testing.T, identityID string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		Delete("/api/v1/identities/" + identityID)
	if err != nil {
		t.Fatalf("infra.DeleteIdentity: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.DeleteIdentity: returned %d: %s", r.StatusCode(), r.String())
	}
}

// AddIdentityToProject adds a machine identity to a project with the given roles.
// Each role entry can include temporary access fields (isTemporary, temporaryMode, temporaryRange,
// temporaryAccessStartTime). For simple cases, use infra.Role("admin") helper.
func (n *NodeJSService) AddIdentityToProject(t *testing.T, projectID, identityID string, roles []RoleAssignment) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(AddIdentityToProjectWithRolesRequest{
			Roles: roles,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/identities/%s", projectID, identityID))
	if err != nil {
		t.Fatalf("infra.AddIdentityToProject: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddIdentityToProject: returned %d: %s", r.StatusCode(), r.String())
	}
}

// Role is a helper to create a simple RoleAssignment for AddIdentityToProject.
func Role(slug string) []RoleAssignment {
	return []RoleAssignment{{Role: slug}}
}

// InviteAndCreateUser invites a user to the org and returns their seed.
// The invite creates a user record + org membership in the DB.
// The user ID is queried from the DB since the invite response doesn't include it.
func (n *NodeJSService) InviteAndCreateUser(t *testing.T, email string) *UserSeed {
	t.Helper()

	// 1. Invite user to org (requires user JWT auth with org context)
	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetBody(InviteToOrgRequest{
			InviteeEmails:  []string{email},
			OrganizationID: n.orgID,
		}).
		Post("/api/v1/invite-org/signup")
	if err != nil {
		t.Fatalf("infra.InviteAndCreateUser: invite failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.InviteAndCreateUser: invite returned %d: %s", r.StatusCode(), r.String())
	}

	// 2. Query user ID from DB (invite creates a user record with the email as username)
	if n.db == nil {
		t.Fatal("infra.InviteAndCreateUser: db is nil, cannot query user ID")
	}
	var userID string
	err = n.db.Primary().QueryRow(context.Background(),
		`SELECT id FROM users WHERE username = $1`, email).Scan(&userID)
	if err != nil {
		t.Fatalf("infra.InviteAndCreateUser: query user ID: %v", err)
	}

	return &UserSeed{
		ID:    userID,
		Email: email,
	}
}

// AddUserToProject adds a user (by email) to a project with the given role slugs.
func (n *NodeJSService) AddUserToProject(t *testing.T, projectID, email string, roleSlugs []string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(AddUserToProjectRequest{
			Usernames: []string{email},
			RoleSlugs: roleSlugs,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships", projectID))
	if err != nil {
		t.Fatalf("infra.AddUserToProject: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddUserToProject: returned %d: %s", r.StatusCode(), r.String())
	}
}

// CreateCustomProjectRole creates a custom project role with the given permissions.
// Requires the "rbac" EE feature to be enabled (see WithEEFeatures).
func (n *NodeJSService) CreateCustomProjectRole(t *testing.T, projectID, slug, name string, permissions []Permission) *CustomRoleSeed {
	t.Helper()

	var resp CreateCustomRoleResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateCustomRoleRequest{
			Slug:        slug,
			Name:        name,
			Permissions: permissions,
		}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/roles", projectID))
	if err != nil {
		t.Fatalf("infra.CreateCustomProjectRole: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateCustomProjectRole: returned %d: %s", r.StatusCode(), r.String())
	}

	return &CustomRoleSeed{
		ID:   resp.Role.ID,
		Slug: resp.Role.Slug,
		Name: resp.Role.Name,
	}
}

// CreateGroup creates an org-level group via the Node.js API.
// Requires the "groups" EE feature to be enabled (see WithEEFeatures).
func (n *NodeJSService) CreateGroup(t *testing.T, name string) *GroupSeed {
	t.Helper()

	var resp CreateGroupResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateGroupRequest{
			Name: name,
			Role: "no-access",
		}).
		SetResult(&resp).
		Post("/api/v1/groups")
	if err != nil {
		t.Fatalf("infra.CreateGroup: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateGroup: returned %d: %s", r.StatusCode(), r.String())
	}

	return &GroupSeed{
		ID:   resp.ID,
		Name: resp.Name,
		Slug: resp.Slug,
	}
}

// AddUserToGroup adds a user (by username/email) to a group.
// Uses the admin user JWT (not identity token) because group member management
// requires org-level group permissions with privilege boundary checks.
func (n *NodeJSService) AddUserToGroup(t *testing.T, groupID, username string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetHeader("Content-Type", "application/json").
		SetBody(struct{}{}).
		Post(fmt.Sprintf("/api/v1/groups/%s/users/%s", groupID, username))
	if err != nil {
		t.Fatalf("infra.AddUserToGroup: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddUserToGroup: returned %d: %s", r.StatusCode(), r.String())
	}
}

// AddGroupToProject adds a group to a project with the given role.
func (n *NodeJSService) AddGroupToProject(t *testing.T, projectID, groupID, role string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(AddGroupToProjectRequest{
			Role: role,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/groups/%s", projectID, groupID))
	if err != nil {
		t.Fatalf("infra.AddGroupToProject: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddGroupToProject: returned %d: %s", r.StatusCode(), r.String())
	}
}

// IdentityPrivilegeOpts holds optional temporal parameters for CreateIdentityAdditionalPrivilege.
type IdentityPrivilegeOpts struct {
	TemporaryRange           string // Duration string (e.g. "1h", "30s")
	TemporaryAccessStartTime string // ISO-8601 datetime string
}

// CreateIdentityAdditionalPrivilege creates an additional privilege for an identity in a project.
// Pass nil opts for permanent privilege, or provide temporal fields for temporary privilege.
func (n *NodeJSService) CreateIdentityAdditionalPrivilege(t *testing.T, identityID, projectID string, permissions []Permission, opts *IdentityPrivilegeOpts) {
	t.Helper()

	privType := PrivilegeType{IsTemporary: false}
	if opts != nil && opts.TemporaryRange != "" {
		privType = PrivilegeType{
			IsTemporary:              true,
			TemporaryMode:            "relative",
			TemporaryRange:           opts.TemporaryRange,
			TemporaryAccessStartTime: opts.TemporaryAccessStartTime,
		}
	}

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateIdentityPrivilegeRequest{
			IdentityID:  identityID,
			ProjectID:   projectID,
			Permissions: permissions,
			Type:        privType,
		}).
		Post("/api/v2/identity-project-additional-privilege/")
	if err != nil {
		t.Fatalf("infra.CreateIdentityAdditionalPrivilege: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateIdentityAdditionalPrivilege: returned %d: %s", r.StatusCode(), r.String())
	}
}

// CreateUserAdditionalPrivilege creates a permanent additional privilege
// for a user in a project via the Node.js API.
// Requires looking up the project membership ID from the DB.
func (n *NodeJSService) CreateUserAdditionalPrivilege(t *testing.T, userID, projectID string, permissions []Permission) {
	t.Helper()

	if n.db == nil {
		t.Fatal("infra.CreateUserAdditionalPrivilege: db is nil")
	}

	// Look up the user's project membership ID from the unified memberships table.
	var membershipID string
	err := n.db.Primary().QueryRow(context.Background(),
		`SELECT id FROM memberships WHERE "actorUserId" = $1 AND "scopeProjectId" = $2 AND scope = 'project'`,
		userID, projectID).Scan(&membershipID)
	if err != nil {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: query membership ID: %v", err)
	}

	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetBody(CreateUserPrivilegeRequest{
			ProjectMembershipID: membershipID,
			Permissions:         permissions,
			Type:                PrivilegeType{IsTemporary: false},
		}).
		Post("/api/v1/user-project-additional-privilege/")
	if err != nil {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: returned %d: %s", r.StatusCode(), r.String())
	}
}

// SecretSeed contains metadata for a secret created via the Node.js API.
type SecretSeed struct {
	ID      string
	Key     string
	Value   string
	Version int
}

// CreateSecretOpts holds optional parameters for CreateSecret.
type CreateSecretOpts struct {
	Comment            string
	Metadata           []SecretMetadataEntry
	TagIDs             []string
	Type               string // "shared" or "personal", defaults to "shared"
	ReminderNote       string
	ReminderRepeatDays *int
}

// CreateSecret creates a secret via the Node.js API.
// Pass nil opts for a basic shared secret, or provide opts for tags, comment, metadata, or personal type.
func (n *NodeJSService) CreateSecret(t *testing.T, projectID, environment, secretPath, key, value string, opts *CreateSecretOpts) *SecretSeed {
	t.Helper()

	var comment string
	var metadata []SecretMetadataEntry
	var tagIDs []string
	var reminderNote string
	var reminderRepeatDays *int
	secretType := "shared"

	if opts != nil {
		comment = opts.Comment
		metadata = opts.Metadata
		tagIDs = opts.TagIDs
		reminderNote = opts.ReminderNote
		reminderRepeatDays = opts.ReminderRepeatDays
		if opts.Type != "" {
			secretType = opts.Type
		}
	}

	token := n.identityToken
	if secretType == "personal" {
		token = n.userToken
	}

	var resp CreateSecretResponse
	r, err := n.client.R().
		SetAuthToken(token).
		SetBody(CreateSecretRequest{
			ProjectID:                projectID,
			Environment:              environment,
			SecretPath:               secretPath,
			SecretValue:              value,
			SecretComment:            comment,
			SecretMetadata:           metadata,
			Type:                     secretType,
			TagIDs:                   tagIDs,
			SecretReminderNote:       reminderNote,
			SecretReminderRepeatDays: reminderRepeatDays,
		}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v4/secrets/%s", key))
	if err != nil {
		t.Fatalf("infra.CreateSecret: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateSecret: returned %d: %s", r.StatusCode(), r.String())
	}

	return &SecretSeed{
		ID:      resp.Secret.ID,
		Key:     key,
		Value:   value,
		Version: 1,
	}
}

// FolderSeed contains metadata for a folder created via the Node.js API.
type FolderSeed struct {
	ID   string
	Name string
}

// CreateFolder creates a secret folder via the Node.js API.
func (n *NodeJSService) CreateFolder(t *testing.T, projectID, environment, path, name string) *FolderSeed {
	t.Helper()

	var resp CreateFolderResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateFolderRequest{
			ProjectID:   projectID,
			Environment: environment,
			Path:        path,
			Name:        name,
		}).
		SetResult(&resp).
		Post("/api/v2/folders")
	if err != nil {
		t.Fatalf("infra.CreateFolder: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateFolder: returned %d: %s", r.StatusCode(), r.String())
	}

	return &FolderSeed{
		ID:   resp.Folder.ID,
		Name: name,
	}
}

// SecretImportSeed contains metadata for a secret import created via the Node.js API.
type SecretImportSeed struct {
	ID string
}

// CreateSecretImport creates a secret import via the Node.js API.
func (n *NodeJSService) CreateSecretImport(t *testing.T, projectID, environment, path, importEnv, importPath string) *SecretImportSeed {
	t.Helper()

	var resp CreateSecretImportResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateSecretImportRequest{
			ProjectID:   projectID,
			Environment: environment,
			Path:        path,
			Import: SecretImportTarget{
				Environment: importEnv,
				Path:        importPath,
			},
		}).
		SetResult(&resp).
		Post("/api/v2/secret-imports")
	if err != nil {
		t.Fatalf("infra.CreateSecretImport: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateSecretImport: returned %d: %s", r.StatusCode(), r.String())
	}

	return &SecretImportSeed{
		ID: resp.SecretImport.ID,
	}
}

// EnvironmentSeed contains metadata for an environment created via the Node.js API.
type EnvironmentSeed struct {
	ID   string
	Slug string
	Name string
}

// CreateEnvironment creates an environment in a project via the Node.js API.
func (n *NodeJSService) CreateEnvironment(t *testing.T, projectID, slug, name string) *EnvironmentSeed {
	t.Helper()

	var resp CreateEnvironmentResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateEnvironmentRequest{
			Slug: slug,
			Name: name,
		}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/environments", projectID))
	if err != nil {
		t.Fatalf("infra.CreateEnvironment: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateEnvironment: returned %d: %s", r.StatusCode(), r.String())
	}

	return &EnvironmentSeed{
		ID:   resp.Environment.ID,
		Slug: slug,
		Name: name,
	}
}

// SoftDeleteEnvironment soft-deletes an environment in a project via the Node.js API.
// The environment is marked for deletion but not immediately removed, allowing for restore.
func (n *NodeJSService) SoftDeleteEnvironment(t *testing.T, projectID, envID string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		Delete(fmt.Sprintf("/api/v1/projects/%s/environments/%s", projectID, envID))
	if err != nil {
		t.Fatalf("infra.SoftDeleteEnvironment: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.SoftDeleteEnvironment: returned %d: %s", r.StatusCode(), r.String())
	}
}

// TagSeed contains metadata for a tag created via the Node.js API.
type TagSeed struct {
	ID   string
	Slug string
	Name string
}

// CreateTag creates a project tag via the Node.js API.
func (n *NodeJSService) CreateTag(t *testing.T, projectID, slug, name, color string) *TagSeed {
	t.Helper()

	var resp CreateTagResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateTagRequest{
			Slug:  slug,
			Name:  name,
			Color: color,
		}).
		SetResult(&resp).
		Post(fmt.Sprintf("/api/v1/projects/%s/tags", projectID))
	if err != nil {
		t.Fatalf("infra.CreateTag: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateTag: returned %d: %s", r.StatusCode(), r.String())
	}

	return &TagSeed{
		ID:   resp.Tag.ID,
		Slug: slug,
		Name: name,
	}
}

// GetIdentityAccessToken creates and returns an access token for an identity.
// This is useful for testing API calls as that specific identity.
func (n *NodeJSService) GetIdentityAccessToken(t *testing.T, identityID string) string {
	t.Helper()

	// First, create a universal auth method for the identity
	// This response contains the clientId
	var universalAuthResp CreateUniversalAuthResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateUniversalAuthRequest{
			IdentityID:                    identityID,
			AccessTokenTrustedIPs:         []IPAddress{{IPAddress: "0.0.0.0/0"}},
			AccessTokenTTL:                3600,
			AccessTokenMaxTTL:             7200,
			AccessTokenNumUsesLimit:       0,
			ClientSecretTrustedIPs:        []IPAddress{{IPAddress: "0.0.0.0/0"}},
			ClientSecretNumUsesLimit:      0,
			IsClientSecretRotationEnabled: false,
		}).
		SetResult(&universalAuthResp).
		Post("/api/v1/auth/universal-auth/identities/" + identityID)
	if err != nil {
		t.Fatalf("infra.GetIdentityAccessToken: create auth failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.GetIdentityAccessToken: create auth returned %d: %s", r.StatusCode(), r.String())
	}

	clientID := universalAuthResp.IdentityUniversalAuth.ClientID

	// Then create a client secret
	var clientSecretResp CreateClientSecretResponse
	r, err = n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(CreateClientSecretRequest{
			Description:  "test-client-secret",
			TTL:          0,
			NumUsesLimit: 0,
		}).
		SetResult(&clientSecretResp).
		Post("/api/v1/auth/universal-auth/identities/" + identityID + "/client-secrets")
	if err != nil {
		t.Fatalf("infra.GetIdentityAccessToken: create client secret failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.GetIdentityAccessToken: create client secret returned %d: %s", r.StatusCode(), r.String())
	}

	clientSecret := clientSecretResp.ClientSecret

	// Finally, login to get the access token
	var loginResp UniversalAuthLoginResponse
	r, err = n.client.R().
		SetBody(UniversalAuthLoginRequest{
			ClientID:     clientID,
			ClientSecret: clientSecret,
		}).
		SetResult(&loginResp).
		Post("/api/v1/auth/universal-auth/login")
	if err != nil {
		t.Fatalf("infra.GetIdentityAccessToken: login failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.GetIdentityAccessToken: login returned %d: %s", r.StatusCode(), r.String())
	}

	return loginResp.AccessToken
}

// RevokeAccessToken revokes an identity access token via the Node.js API.
func (n *NodeJSService) RevokeAccessToken(t *testing.T, accessToken string) {
	t.Helper()

	r, err := n.client.R().
		SetBody(map[string]string{"accessToken": accessToken}).
		Post("/api/v1/auth/token/revoke")
	if err != nil {
		t.Fatalf("infra.RevokeAccessToken: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.RevokeAccessToken: returned %d: %s", r.StatusCode(), r.String())
	}
}

// ServiceTokenScope defines the scope for a service token.
type ServiceTokenScope struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

// CreateServiceTokenRequest is the request body for creating a service token.
type CreateServiceTokenRequest struct {
	Name         string              `json:"name"`
	WorkspaceID  string              `json:"workspaceId"`
	Scopes       []ServiceTokenScope `json:"scopes"`
	EncryptedKey string              `json:"encryptedKey"`
	IV           string              `json:"iv"`
	Tag          string              `json:"tag"`
	ExpiresIn    *int                `json:"expiresIn"`
	Permissions  []string            `json:"permissions"`
}

// CreateServiceTokenResponse is the response from creating a service token.
type CreateServiceTokenResponse struct {
	ServiceToken     string `json:"serviceToken"`
	ServiceTokenData struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"serviceTokenData"`
}

// ServiceTokenSeed holds the created service token info.
type ServiceTokenSeed struct {
	ID    string
	Name  string
	Token string
}

// CreateServiceTokenOpts contains options for creating a service token.
type CreateServiceTokenOpts struct {
	Scopes      []ServiceTokenScope
	Permissions []string
	ExpiresIn   *int
}

// CreateServiceToken creates a service token for a project.
func (n *NodeJSService) CreateServiceToken(t *testing.T, projectID string, opts *CreateServiceTokenOpts) *ServiceTokenSeed {
	t.Helper()

	scopes := []ServiceTokenScope{{Environment: "dev", SecretPath: "/"}}
	permissions := []string{"read", "write"}

	if opts != nil {
		if len(opts.Scopes) > 0 {
			scopes = opts.Scopes
		}
		if len(opts.Permissions) > 0 {
			permissions = opts.Permissions
		}
	}

	var expiresIn *int
	if opts != nil {
		expiresIn = opts.ExpiresIn
	}

	var resp CreateServiceTokenResponse
	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetBody(CreateServiceTokenRequest{
			Name:         "test-service-token-" + uuid.New().String()[:8],
			WorkspaceID:  projectID,
			Scopes:       scopes,
			EncryptedKey: "",
			IV:           "",
			Tag:          "",
			ExpiresIn:    expiresIn,
			Permissions:  permissions,
		}).
		SetResult(&resp).
		Post("/api/v2/service-token")
	if err != nil {
		t.Fatalf("infra.CreateServiceToken: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateServiceToken: returned %d: %s", r.StatusCode(), r.String())
	}

	return &ServiceTokenSeed{
		ID:    resp.ServiceTokenData.ID,
		Name:  resp.ServiceTokenData.Name,
		Token: resp.ServiceToken,
	}
}

// DeleteServiceToken deletes a service token.
func (n *NodeJSService) DeleteServiceToken(t *testing.T, serviceTokenID string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.userToken).
		Delete("/api/v2/service-token/" + serviceTokenID)
	if err != nil {
		t.Fatalf("infra.DeleteServiceToken: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.DeleteServiceToken: returned %d: %s", r.StatusCode(), r.String())
	}
}

// GetSecretByKey reads a secret by key via the Node.js API.
func (n *NodeJSService) GetSecretByKey(t *testing.T, projectID, environment, secretPath, key string) *SecretSeed {
	t.Helper()

	var resp GetSecretResponse
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetQueryParams(map[string]string{
			"projectId":   projectID,
			"environment": environment,
			"secretPath":  secretPath,
		}).
		SetResult(&resp).
		Get(fmt.Sprintf("/api/v4/secrets/%s", key))
	if err != nil {
		t.Fatalf("infra.GetSecretByKey: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.GetSecretByKey: returned %d: %s", r.StatusCode(), r.String())
	}

	return &SecretSeed{
		ID:      resp.Secret.ID,
		Key:     resp.Secret.Key,
		Value:   resp.Secret.Value,
		Version: resp.Secret.Version,
	}
}
