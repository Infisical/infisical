package testutil

import (
	"crypto/rand"
	"fmt"
	"log"
	"testing"

	"github.com/go-resty/resty/v2"
)

// ProjectSeed contains IDs for a project created via the Node.js API.
type ProjectSeed struct {
	ID      string
	Slug    string
	EnvSlug string // default environment created with the project
}

// bootstrap calls the admin bootstrap API to create the initial user, org,
// and machine identity, then logs in to obtain a user JWT.
// Called once during SetupInfra. Uses log.Fatalf since it runs in TestMain.
func (infra *TestInfra) bootstrap() {
	client := resty.New().SetBaseURL(infra.NodeJSURL)

	// Step 1: Bootstrap — creates admin user, org, and machine identity.
	var bootstrapResp map[string]any
	resp, err := client.R().
		SetBody(map[string]any{
			"email":        "test-admin@example.com",
			"password":     "testpassword123",
			"organization": "test-org",
		}).
		SetResult(&bootstrapResp).
		Post("/api/v1/admin/bootstrap")
	if err != nil {
		log.Fatalf("testutil.bootstrap: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("testutil.bootstrap: returned %d: %s", resp.StatusCode(), resp.String())
	}

	infra.OrgID = jsonStr(bootstrapResp, "organization.id")
	infra.IdentityToken = jsonStr(bootstrapResp, "identity.credentials.token")
	infra.UserEmail = jsonStr(bootstrapResp, "user.email")
	infra.UserID = jsonStr(bootstrapResp, "user.id")

	// Step 2: Login as the user to get a user JWT.
	var loginResp map[string]any
	resp, err = client.R().
		SetBody(map[string]any{
			"email":    infra.UserEmail,
			"password": "testpassword123",
		}).
		SetResult(&loginResp).
		Post("/api/v3/auth/login")
	if err != nil {
		log.Fatalf("testutil.bootstrap: login request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("testutil.bootstrap: login returned %d: %s", resp.StatusCode(), resp.String())
	}
	infra.UserToken = jsonStr(loginResp, "accessToken")

	infra.client = client
}

// MustCreateProject creates a new project via the Node.js API.
// Safe to call from TestMain — uses log.Fatalf on error.
func (infra *TestInfra) MustCreateProject(name string) *ProjectSeed {
	var projectResp map[string]any
	resp, err := infra.client.R().
		SetAuthToken(infra.IdentityToken).
		SetBody(map[string]any{
			"projectName": name,
			"slug":        fmt.Sprintf("test-%s", name),
			"type":        "secret-manager",
		}).
		SetResult(&projectResp).
		Post("/api/v1/projects")
	if err != nil {
		log.Fatalf("testutil.MustCreateProject: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("testutil.MustCreateProject: returned %d: %s", resp.StatusCode(), resp.String())
	}

	return &ProjectSeed{
		ID:      jsonStr(projectResp, "project.id"),
		Slug:    jsonStr(projectResp, "project.slug"),
		EnvSlug: "dev",
	}
}

// CreateProject creates a new project via the Node.js API and returns its metadata.
func (infra *TestInfra) CreateProject(t *testing.T, name string) *ProjectSeed {
	t.Helper()

	b := make([]byte, 4)
	rand.Read(b)
	slug := fmt.Sprintf("t-%s-%x", name, b)
	if len(slug) > 36 {
		slug = slug[:36]
	}

	var projectResp map[string]any
	resp, err := infra.client.R().
		SetAuthToken(infra.IdentityToken).
		SetBody(map[string]any{
			"projectName": name,
			"slug":        slug,
			"type":        "secret-manager",
		}).
		SetResult(&projectResp).
		Post("/api/v1/projects")
	if err != nil {
		t.Fatalf("testutil.CreateProject: request failed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("testutil.CreateProject: returned %d: %s", resp.StatusCode(), resp.String())
	}

	return &ProjectSeed{
		ID:      jsonStr(projectResp, "project.id"),
		Slug:    jsonStr(projectResp, "project.slug"),
		EnvSlug: "dev",
	}
}

// DeleteProject deletes a project via the Node.js API.
func (infra *TestInfra) DeleteProject(t *testing.T, projectID string) {
	t.Helper()

	resp, err := infra.client.R().
		SetAuthToken(infra.IdentityToken).
		Delete("/api/v1/projects/" + projectID)
	if err != nil {
		t.Fatalf("testutil.DeleteProject: request failed: %v", err)
	}
	if resp.IsError() {
		t.Fatalf("testutil.DeleteProject: returned %d: %s", resp.StatusCode(), resp.String())
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

// splitDotPath splits a dot-separated path into keys.
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
