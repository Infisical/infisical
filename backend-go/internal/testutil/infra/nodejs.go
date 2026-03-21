package infra

import (
	"crypto/rand"
	"fmt"
	"log"
	"testing"
	"time"

	"context"

	"github.com/go-resty/resty/v2"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// ProjectSeed contains IDs for a project created via the Node.js API.
type ProjectSeed struct {
	ID      string
	Slug    string
	EnvSlug string
}

// NodeJSService provides access to a running Node.js backend container
// and the bootstrapped credentials (admin user, org, machine identity).
type NodeJSService struct {
	container     testcontainers.Container
	url           string
	client        *resty.Client
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

func startNodeJS(ctx context.Context, networkName string) (*NodeJSService, error) {
	req := testcontainers.ContainerRequest{
		Image:        "infisical/infisical:latest",
		ExposedPorts: []string{"8080/tcp"},
		Networks:     []string{networkName},
		NetworkAliases: map[string][]string{
			networkName: {"backend-nodejs"},
		},
		Env: map[string]string{
			"NODE_ENV":          "development",
			"DB_CONNECTION_URI": fmt.Sprintf("postgres://%s:%s@db:5432/%s?sslmode=disable", pgUser, pgPassword, pgDB),
			"REDIS_URL":         "redis://redis:6379",
			"ENCRYPTION_KEY":    EncryptionKey,
			"AUTH_SECRET":       AuthSecret,
			"SITE_URL":          "http://localhost:8080",
			"TELEMETRY_ENABLED": "false",
		},
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

	url := fmt.Sprintf("http://%s:%d", host, mappedPort.Int())

	return &NodeJSService{
		container: container,
		url:       url,
		client:    resty.New().SetBaseURL(url),
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
	n.userToken = jsonStr(loginResp, "accessToken")
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
