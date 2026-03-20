package testutil

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/docker/go-connections/nat"
	"github.com/go-resty/resty/v2"
	"github.com/gofrs/flock"
	tc "github.com/testcontainers/testcontainers-go/modules/compose"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
)

// TestInfra holds references to the test infrastructure and bootstrapped credentials.
type TestInfra struct {
	DBURI     string
	RedisURL  string
	NodeJSURL string
	DB        pg.DB
	Config    *config.Config
	compose   tc.ComposeStack
	client    *resty.Client

	// isOwner is true if this process started the compose stack.
	// Guests (other test packages) reuse the existing stack.
	isOwner bool

	// Bootstrapped credentials
	OrgID         string
	UserEmail     string
	UserID        string
	IdentityToken string // Machine identity access token
	UserToken     string // User JWT
}

// infraState is the JSON structure persisted to .test-infra-state.json
// so that concurrent test packages can share a single compose stack.
type infraState struct {
	DBURI         string `json:"db_uri"`
	RedisURL      string `json:"redis_url"`
	NodeJSURL     string `json:"nodejs_url"`
	OrgID         string `json:"org_id"`
	UserEmail     string `json:"user_email"`
	UserID        string `json:"user_id"`
	IdentityToken string `json:"identity_token"`
	UserToken     string `json:"user_token"`
}

// findModuleRoot walks up from the current directory to find go.mod,
// returning the directory that contains it.
func findModuleRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("could not find go.mod in any parent directory")
		}
		dir = parent
	}
}

// NOTE: This shared-infra approach is a temporary workaround.
// Because the Node.js backend is so slow
// we can only run one instance. A file lock + state file coordinates across
// packages so compose starts once and subsequent packages reuse it.
//
// Once the full Go migration is complete and the Node.js dependency is removed,
// each test package can spin up its own isolated containers with random ports,
// enabling true parallel execution without any cross-process coordination.

// SetupInfra starts or reuses the shared test infrastructure.
//
// A file lock (.test-infra.lock) prevents races between parallel packages.
// If a previous run left a healthy stack, we reuse it via .test-infra-state.json.
// Otherwise we start a fresh compose stack and bootstrap credentials.
//
// Uses log.Fatalf for errors because this runs in TestMain where
// *testing.T is not available.
func SetupInfra() *TestInfra {
	root, err := findModuleRoot()
	if err != nil {
		log.Fatalf("testutil.SetupInfra: %v", err)
	}

	lockPath := filepath.Join(root, ".test-infra.lock")
	statePath := filepath.Join(root, ".test-infra-state.json")

	// Acquire cross-process file lock so only one package starts compose.
	fileLock := flock.New(lockPath)
	if err := fileLock.Lock(); err != nil {
		log.Fatalf("testutil.SetupInfra: failed to acquire lock: %v", err)
	}
	defer func() {
		if err := fileLock.Unlock(); err != nil {
			log.Printf("testutil.SetupInfra: failed to release lock: %v", err)
		}
	}()

	// Try to reuse an existing healthy stack.
	if state, err := loadState(statePath); err == nil {
		if checkHealth(state.NodeJSURL) {
			log.Println("testutil.SetupInfra: reusing existing infra")
			setTestEnv(state.DBURI, state.RedisURL)
			cfg := mustLoadConfig()
			db := mustConnectDB(cfg)
			return &TestInfra{
				DBURI:         state.DBURI,
				RedisURL:      state.RedisURL,
				NodeJSURL:     state.NodeJSURL,
				DB:            db,
				Config:        cfg,
				client:        resty.New().SetBaseURL(state.NodeJSURL),
				isOwner:       false,
				OrgID:         state.OrgID,
				UserEmail:     state.UserEmail,
				UserID:        state.UserID,
				IdentityToken: state.IdentityToken,
				UserToken:     state.UserToken,
			}
		}
		// Stale state — remove and start fresh.
		log.Println("testutil.SetupInfra: stale state file, starting fresh")
		os.Remove(statePath)
	}

	// Owner path: start compose from scratch.
	infra := startCompose(root)
	infra.isOwner = true
	infra.bootstrap()

	// Persist state so other packages can reuse this stack.
	saveState(statePath, &infraState{
		DBURI:         infra.DBURI,
		RedisURL:      infra.RedisURL,
		NodeJSURL:     infra.NodeJSURL,
		OrgID:         infra.OrgID,
		UserEmail:     infra.UserEmail,
		UserID:        infra.UserID,
		IdentityToken: infra.IdentityToken,
		UserToken:     infra.UserToken,
	})

	log.Println("testutil.SetupInfra: bootstrap complete, state saved")

	return infra
}

// startCompose brings up the docker-compose.test.yml stack via testcontainers.
func startCompose(root string) *TestInfra {
	ctx := context.Background()
	composePath := filepath.Join(root, "docker-compose.test.yml")

	log.Printf("testutil.startCompose: starting compose from %s", composePath)

	compose, err := tc.NewDockerCompose(composePath)
	if err != nil {
		log.Fatalf("testutil.startCompose: failed to create compose: %v", err)
	}

	err = compose.
		WaitForService("db", wait.ForListeningPort("5432/tcp").WithStartupTimeout(60*time.Second)).
		WaitForService("redis", wait.ForListeningPort("6379/tcp").WithStartupTimeout(60*time.Second)).
		WaitForService("backend-nodejs", wait.ForHTTP("/api/status").WithPort("8080/tcp").WithStartupTimeout(120*time.Second)).
		Up(ctx, tc.Wait(true))
	if err != nil {
		log.Fatalf("testutil.startCompose: failed to start compose: %v", err)
	}

	log.Println("testutil.startCompose: all services up")

	// Discover mapped ports.
	dbHost, dbPort, err := getServiceHostPort(ctx, compose, "db", 5432)
	if err != nil {
		log.Fatalf("testutil.startCompose: failed to get db host/port: %v", err)
	}

	redisHost, redisPort, err := getServiceHostPort(ctx, compose, "redis", 6379)
	if err != nil {
		log.Fatalf("testutil.startCompose: failed to get redis host/port: %v", err)
	}

	nodejsHost, nodejsPort, err := getServiceHostPort(ctx, compose, "backend-nodejs", 8080)
	if err != nil {
		log.Fatalf("testutil.startCompose: failed to get nodejs host/port: %v", err)
	}

	dbURI := fmt.Sprintf("postgres://infisical:infisical@%s:%d/infisical?sslmode=disable", dbHost, dbPort)
	redisURL := fmt.Sprintf("redis://%s:%d", redisHost, redisPort)
	nodejsURL := fmt.Sprintf("http://%s:%d", nodejsHost, nodejsPort)

	log.Printf("testutil.startCompose: db=%s redis=%s nodejs=%s", dbURI, redisURL, nodejsURL)

	setTestEnv(dbURI, redisURL)
	cfg := mustLoadConfig()
	db := mustConnectDB(cfg)

	return &TestInfra{
		DBURI:     dbURI,
		RedisURL:  redisURL,
		NodeJSURL: nodejsURL,
		DB:        db,
		Config:    cfg,
		compose:   compose,
		client:    resty.New().SetBaseURL(nodejsURL),
	}
}

// setTestEnv sets the environment variables needed for config.LoadConfig() in tests.
func setTestEnv(dbURI, redisURL string) {
	os.Setenv("DB_CONNECTION_URI", dbURI)
	os.Setenv("REDIS_URL", redisURL)
	os.Setenv("AUTH_SECRET", AuthSecret)
	os.Setenv("ENCRYPTION_KEY", EncryptionKey)
	os.Setenv("NODE_ENV", NodeEnv)
}

// mustLoadConfig loads the application config or fatals.
func mustLoadConfig() *config.Config {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("testutil.mustLoadConfig: %v", err)
	}
	return cfg
}

// mustConnectDB creates a pg.DB connection via pg.NewPostgresDB or fatals.
func mustConnectDB(cfg *config.Config) pg.DB {
	ctx := context.Background()

	db, err := pg.NewPostgresDB(ctx, cfg.DBConnectionURI, cfg.DBRootCert, cfg.DBReadReplicas)
	if err != nil {
		log.Fatalf("testutil.mustConnectDB: %v", err)
	}

	return db
}

// Teardown cleans up resources for this test package.
// Only closes the DB pool — does NOT tear down compose since other packages
// may still be using the shared stack. Use `make test-cleanup` for that.
func (infra *TestInfra) Teardown() {
	infra.DB.Close()
}

// checkHealth pings the Node.js backend to see if the stack is alive.
func checkHealth(nodejsURL string) bool {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(nodejsURL + "/api/status")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// loadState reads the persisted infra state from disk.
func loadState(path string) (*infraState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var state infraState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

// saveState writes the infra state to disk for other packages to reuse.
func saveState(path string, state *infraState) {
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		log.Fatalf("testutil.saveState: failed to marshal state: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		log.Fatalf("testutil.saveState: failed to write state file: %v", err)
	}
}

// getServiceHostPort returns the host and mapped port for a compose service.
func getServiceHostPort(ctx context.Context, compose tc.ComposeStack, service string, port int) (string, int, error) {
	container, err := compose.ServiceContainer(ctx, service)
	if err != nil {
		return "", 0, fmt.Errorf("get container for %s: %w", service, err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		return "", 0, fmt.Errorf("get host for %s: %w", service, err)
	}

	mappedPort, err := container.MappedPort(ctx, nat.Port(fmt.Sprintf("%d/tcp", port)))
	if err != nil {
		return "", 0, fmt.Errorf("get mapped port for %s: %w", service, err)
	}

	return host, mappedPort.Int(), nil
}
