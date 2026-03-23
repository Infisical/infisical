package infra

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"testing"
	"time"

	"github.com/go-resty/resty/v2"
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
	var bootstrapResp map[string]any
	resp, err := n.client.R().
		SetBody(map[string]any{
			"email":        "test-admin@example.com",
			"password":     "testpassword123",
			"organization": "test-org",
		}).
		SetResult(&bootstrapResp).
		Post("/api/v1/admin/bootstrap")
	if err != nil {
		log.Fatalf("infra.bootstrap: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: returned %d: %s", resp.StatusCode(), resp.String())
	}

	n.orgID = jsonStr(bootstrapResp, "organization.id")
	n.identityToken = jsonStr(bootstrapResp, "identity.credentials.token")
	n.userEmail = jsonStr(bootstrapResp, "user.email")
	n.userID = jsonStr(bootstrapResp, "user.id")

	var loginResp map[string]any
	resp, err = n.client.R().
		SetBody(map[string]any{
			"email":    n.userEmail,
			"password": "testpassword123",
		}).
		SetResult(&loginResp).
		Post("/api/v3/auth/login")
	if err != nil {
		log.Fatalf("infra.bootstrap: login request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: login returned %d: %s", resp.StatusCode(), resp.String())
	}
	loginToken := jsonStr(loginResp, "accessToken")

	// Select organization to get an org-scoped JWT (required for org-level API calls).
	var selectOrgResp map[string]any
	resp, err = n.client.R().
		SetHeader("Authorization", "Bearer "+loginToken).
		SetBody(map[string]any{
			"organizationId": n.orgID,
		}).
		SetResult(&selectOrgResp).
		Post("/api/v3/auth/select-organization")
	if err != nil {
		log.Fatalf("infra.bootstrap: select-org request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("infra.bootstrap: select-org returned %d: %s", resp.StatusCode(), resp.String())
	}
	n.userToken = jsonStr(selectOrgResp, "token")
}

// MustCreateProject creates a new project via the Node.js API.
// Safe to call from TestMain — uses log.Fatalf on error.
func (n *NodeJSService) MustCreateProject(name string) *ProjectSeed {
	var projectResp map[string]any
	resp, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"projectName": name,
			"slug":        fmt.Sprintf("test-%s", name),
			"type":        "secret-manager",
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
		ID:      jsonStr(projectResp, "project.id"),
		Slug:    jsonStr(projectResp, "project.slug"),
		EnvSlug: "dev",
	}
}

// CreateProject creates a new project via the Node.js API and returns its metadata.
func (n *NodeJSService) CreateProject(t *testing.T, name string) *ProjectSeed {
	t.Helper()

	b := make([]byte, 4)
	rand.Read(b)
	slug := fmt.Sprintf("t-%s-%x", name, b)
	if len(slug) > 36 {
		slug = slug[:36]
	}

	var projectResp map[string]any
	resp, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"projectName": name,
			"slug":        slug,
			"type":        "secret-manager",
		}).
		SetResult(&projectResp).
		Post("/api/v1/projects")
	if err != nil {
		t.Fatalf("infra.CreateProject: request failed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("infra.CreateProject: returned %d: %s", resp.StatusCode(), resp.String())
	}

	return &ProjectSeed{
		ID:      jsonStr(projectResp, "project.id"),
		Slug:    jsonStr(projectResp, "project.slug"),
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

// jsonStr extracts a string value from a nested JSON map using dot-separated path.
func jsonStr(m map[string]any, path string) string {
	keys := splitDotPath(path)
	current := any(m)

	for _, key := range keys {
		obj, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current = obj[key]
	}

	s, _ := current.(string)
	return s
}

func splitDotPath(path string) []string {
	var keys []string
	start := 0
	for i := 0; i < len(path); i++ {
		if path[i] == '.' {
			keys = append(keys, path[start:i])
			start = i + 1
		}
	}
	keys = append(keys, path[start:])
	return keys
}

// CreateIdentity creates a new machine identity in the bootstrap org.
func (n *NodeJSService) CreateIdentity(t *testing.T, name string) *IdentitySeed {
	t.Helper()

	var resp map[string]any
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"name":           name,
			"organizationId": n.orgID,
			"role":           "no-access",
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
		ID:   jsonStr(resp, "identity.id"),
		Name: name,
	}
}

// AddIdentityToProject adds a machine identity to a project with the given role.
func (n *NodeJSService) AddIdentityToProject(t *testing.T, projectID, identityID, role string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"role": role,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/identities/%s", projectID, identityID))
	if err != nil {
		t.Fatalf("infra.AddIdentityToProject: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddIdentityToProject: returned %d: %s", r.StatusCode(), r.String())
	}
}

// AddIdentityToProjectWithRoles adds a machine identity to a project with a roles array.
// Each role entry can include temporary access fields (isTemporary, temporaryMode, temporaryRange,
// temporaryAccessStartTime).
func (n *NodeJSService) AddIdentityToProjectWithRoles(t *testing.T, projectID, identityID string, roles []map[string]any) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"roles": roles,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/identities/%s", projectID, identityID))
	if err != nil {
		t.Fatalf("infra.AddIdentityToProjectWithRoles: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddIdentityToProjectWithRoles: returned %d: %s", r.StatusCode(), r.String())
	}
}

// InviteAndCreateUser invites a user to the org and returns their seed.
// The invite creates a user record + org membership in the DB.
// The user ID is queried from the DB since the invite response doesn't include it.
func (n *NodeJSService) InviteAndCreateUser(t *testing.T, email string) *UserSeed {
	t.Helper()

	// 1. Invite user to org (requires user JWT auth with org context)
	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetBody(map[string]any{
			"inviteeEmails":  []string{email},
			"organizationId": n.orgID,
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
	err = n.db.Primary().QueryRowContext(context.Background(),
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
		SetBody(map[string]any{
			"emails":    []string{email},
			"roleSlugs": roleSlugs,
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
// Permissions is a slice of permission objects, each with "subject", "action", and
// optionally "conditions" and "inverted" fields.
func (n *NodeJSService) CreateCustomProjectRole(t *testing.T, projectID, slug, name string, permissions []map[string]any) *CustomRoleSeed {
	t.Helper()

	var resp map[string]any
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"slug":        slug,
			"name":        name,
			"permissions": permissions,
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
		ID:   jsonStr(resp, "role.id"),
		Slug: jsonStr(resp, "role.slug"),
		Name: jsonStr(resp, "role.name"),
	}
}

// CreateGroup creates an org-level group via the Node.js API.
// Requires the "groups" EE feature to be enabled (see WithEEFeatures).
func (n *NodeJSService) CreateGroup(t *testing.T, name string) *GroupSeed {
	t.Helper()

	var resp map[string]any
	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"name": name,
			"role": "no-access",
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
		ID:   jsonStr(resp, "id"),
		Name: jsonStr(resp, "name"),
		Slug: jsonStr(resp, "slug"),
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
		SetBody("{}").
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
		SetBody(map[string]any{
			"role": role,
		}).
		Post(fmt.Sprintf("/api/v1/projects/%s/memberships/groups/%s", projectID, groupID))
	if err != nil {
		t.Fatalf("infra.AddGroupToProject: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.AddGroupToProject: returned %d: %s", r.StatusCode(), r.String())
	}
}

// CreateIdentityAdditionalPrivilege creates a permanent additional privilege
// for an identity in a project via the V2 Node.js API.
func (n *NodeJSService) CreateIdentityAdditionalPrivilege(t *testing.T, identityID, projectID string, permissions []map[string]any) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"identityId":  identityID,
			"projectId":   projectID,
			"permissions": permissions,
			"type": map[string]any{
				"isTemporary": false,
			},
		}).
		Post("/api/v2/identity-project-additional-privilege/")
	if err != nil {
		t.Fatalf("infra.CreateIdentityAdditionalPrivilege: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateIdentityAdditionalPrivilege: returned %d: %s", r.StatusCode(), r.String())
	}
}

// CreateIdentityTemporaryAdditionalPrivilege creates a temporary additional privilege
// for an identity in a project. temporaryRange is a duration string (e.g. "1h", "30s").
// temporaryAccessStartTime is an ISO-8601 datetime string.
func (n *NodeJSService) CreateIdentityTemporaryAdditionalPrivilege(t *testing.T, identityID, projectID string, permissions []map[string]any, temporaryRange, temporaryAccessStartTime string) {
	t.Helper()

	r, err := n.client.R().
		SetAuthToken(n.identityToken).
		SetBody(map[string]any{
			"identityId":  identityID,
			"projectId":   projectID,
			"permissions": permissions,
			"type": map[string]any{
				"isTemporary":              true,
				"temporaryMode":            "relative",
				"temporaryRange":           temporaryRange,
				"temporaryAccessStartTime": temporaryAccessStartTime,
			},
		}).
		Post("/api/v2/identity-project-additional-privilege/")
	if err != nil {
		t.Fatalf("infra.CreateIdentityTemporaryAdditionalPrivilege: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateIdentityTemporaryAdditionalPrivilege: returned %d: %s", r.StatusCode(), r.String())
	}
}

// CreateUserAdditionalPrivilege creates a permanent additional privilege
// for a user in a project via the Node.js API.
// Requires looking up the project membership ID from the DB.
func (n *NodeJSService) CreateUserAdditionalPrivilege(t *testing.T, userID, projectID string, permissions []map[string]any) {
	t.Helper()

	if n.db == nil {
		t.Fatal("infra.CreateUserAdditionalPrivilege: db is nil")
	}

	// Look up the user's project membership ID from the unified memberships table.
	var membershipID string
	err := n.db.Primary().QueryRowContext(context.Background(),
		`SELECT id FROM memberships WHERE "actorUserId" = $1 AND "scopeProjectId" = $2 AND scope = 'project'`,
		userID, projectID).Scan(&membershipID)
	if err != nil {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: query membership ID: %v", err)
	}

	r, err := n.client.R().
		SetAuthToken(n.userToken).
		SetBody(map[string]any{
			"projectMembershipId": membershipID,
			"permissions":         permissions,
			"type": map[string]any{
				"isTemporary": false,
			},
		}).
		Post("/api/v1/user-project-additional-privilege/")
	if err != nil {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: request failed: %v", err)
	}
	if r.IsError() {
		t.Fatalf("infra.CreateUserAdditionalPrivilege: returned %d: %s", r.StatusCode(), r.String())
	}
}
