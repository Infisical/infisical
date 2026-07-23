//go:build integration

package nodejs

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/infisical/api/internal/database/pg"
)

const (
	image        = "infisical/infisical:latest"
	networkAlias = "backend-nodejs"
	redisURL     = "redis://redis:6379"
	nodeEnv      = "development"
)

// Config carries everything the Node.js container needs to start. The infra
// builder fills it from its own constants so this package never imports infra
// (keeping the infra -> nodejs dependency acyclic).
type Config struct {
	NetworkName   string
	Files         []testcontainers.ContainerFile
	Cmd           []string
	DBUser        string
	DBPassword    string
	DBName        string
	EncryptionKey string
	AuthSecret    string
}

// Service provides access to a running Node.js backend container and the
// bootstrapped credentials (admin user, org, machine identity).
type Service struct {
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

func (s *Service) URL() string           { return s.url }
func (s *Service) OrgID() string         { return s.orgID }
func (s *Service) UserID() string        { return s.userID }
func (s *Service) UserEmail() string     { return s.userEmail }
func (s *Service) IdentityToken() string { return s.identityToken }
func (s *Service) UserToken() string     { return s.userToken }
func (s *Service) Client() *resty.Client { return s.client }

// AttachDB gives the service a DB handle for seed helpers that read rows the API
// doesn't return (e.g. user IDs after invite).
func (s *Service) AttachDB(db pg.DB) { s.db = db }

// Terminate stops and removes the underlying container.
func (s *Service) Terminate(ctx context.Context) error {
	return s.container.Terminate(ctx)
}

// Start launches the Node.js backend container and returns the service. Bootstrap
// must be called once the supporting infra (DB/Redis) is reachable.
func Start(ctx context.Context, cfg *Config) (*Service, error) {
	// When a custom Cmd is provided (e.g. for patching files via sed), we need
	// to run as root because the container image sets USER non-root-user which
	// cannot write to root-owned paths like /backend/dist/.
	user := ""
	if len(cfg.Cmd) > 0 {
		user = "root"
	}

	req := testcontainers.ContainerRequest{
		Image:        image,
		ExposedPorts: []string{"8080/tcp"},
		Networks:     []string{cfg.NetworkName},
		NetworkAliases: map[string][]string{
			cfg.NetworkName: {networkAlias},
		},
		User: user,
		Env: map[string]string{
			"NODE_ENV":          nodeEnv,
			"DB_CONNECTION_URI": fmt.Sprintf("postgres://%s:%s@db:5432/%s?sslmode=disable", cfg.DBUser, cfg.DBPassword, cfg.DBName),
			"REDIS_URL":         redisURL,
			"ENCRYPTION_KEY":    cfg.EncryptionKey,
			"AUTH_SECRET":       cfg.AuthSecret,
			"SITE_URL":          "http://localhost:8080",
			"TELEMETRY_ENABLED": "false",
			"SMTP_HOST":         "",
		},
		Files:      cfg.Files,
		Cmd:        cfg.Cmd,
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

	return &Service{
		container: container,
		url:       baseURL,
		client:    resty.New().SetBaseURL(baseURL),
	}, nil
}

// BootstrapRequest is the request body for POST /api/v1/admin/bootstrap.
type BootstrapRequest struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	Organization string `json:"organization"`
}

// BootstrapResponse is the response from POST /api/v1/admin/bootstrap.
type BootstrapResponse struct {
	Organization struct {
		ID string `json:"id"`
	} `json:"organization"`
	Identity struct {
		Credentials struct {
			Token string `json:"token"`
		} `json:"credentials"`
	} `json:"identity"`
	User struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
}

// LoginRequest is the request body for POST /api/v3/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse is the response from POST /api/v3/auth/login.
type LoginResponse struct {
	AccessToken string `json:"accessToken"`
}

// SelectOrgRequest is the request body for POST /api/v3/auth/select-organization.
type SelectOrgRequest struct {
	OrganizationID string `json:"organizationId"`
}

// SelectOrgResponse is the response from POST /api/v3/auth/select-organization.
type SelectOrgResponse struct {
	Token string `json:"token"`
}

// Bootstrap creates the initial admin user, org, and machine identity, then logs
// in to obtain an org-scoped user JWT. Uses log.Fatalf since it runs in TestMain.
func (s *Service) Bootstrap() {
	var bootstrapResp BootstrapResponse
	resp, err := s.client.R().
		SetBody(BootstrapRequest{
			Email:        "test-admin@example.com",
			Password:     "testpassword123",
			Organization: "test-org",
		}).
		SetResult(&bootstrapResp).
		Post("/api/v1/admin/bootstrap")
	if err != nil {
		log.Fatalf("nodejs.Bootstrap: request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("nodejs.Bootstrap: returned %d: %s", resp.StatusCode(), resp.String())
	}

	s.orgID = bootstrapResp.Organization.ID
	s.identityToken = bootstrapResp.Identity.Credentials.Token
	s.userEmail = bootstrapResp.User.Email
	s.userID = bootstrapResp.User.ID

	var loginResp LoginResponse
	resp, err = s.client.R().
		SetBody(LoginRequest{
			Email:    s.userEmail,
			Password: "testpassword123",
		}).
		SetResult(&loginResp).
		Post("/api/v3/auth/login")
	if err != nil {
		log.Fatalf("nodejs.Bootstrap: login request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("nodejs.Bootstrap: login returned %d: %s", resp.StatusCode(), resp.String())
	}

	// Select organization to get an org-scoped JWT (required for org-level API calls).
	var selectOrgResp SelectOrgResponse
	resp, err = s.client.R().
		SetHeader("Authorization", "Bearer "+loginResp.AccessToken).
		SetBody(SelectOrgRequest{
			OrganizationID: s.orgID,
		}).
		SetResult(&selectOrgResp).
		Post("/api/v3/auth/select-organization")
	if err != nil {
		log.Fatalf("nodejs.Bootstrap: select-org request failed: %v", err)
	}
	if resp.IsError() {
		log.Fatalf("nodejs.Bootstrap: select-org returned %d: %s", resp.StatusCode(), resp.String())
	}
	s.userToken = selectOrgResp.Token
}
