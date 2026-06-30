//go:build integration

package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// Environment variables for Infisical test credentials.
const (
	EnvInfisicalTestAPIURL       = "INFISICAL_TEST_API_URL"
	EnvInfisicalTestClientID     = "INFISICAL_TEST_IDENTITY_CLIENT_ID"
	EnvInfisicalTestClientSecret = "INFISICAL_TEST_IDENTITY_CLIENT_SECRET"
	EnvInfisicalTestProjectID    = "INFISICAL_TEST_PROJECT_ID"

	DefaultInfisicalAPIURL = "https://app.infisical.com"
	TestEnvironment        = "default"
)

// Secret folder paths for different teams/domains.
const (
	SecretPathPlatform      = "/platform"
	SecretPathSecretManager = "/secretmanager"
)

// infisicalClient handles authentication and fetching secrets from Infisical.
type infisicalClient struct {
	httpClient  *http.Client
	apiURL      string
	accessToken string
	projectID   string
}

var (
	infisicalClientOnce     sync.Once
	infisicalClientInstance *infisicalClient
	errInfisicalClient      error
)

// getInfisicalClient returns a singleton authenticated Infisical client.
func getInfisicalClient() (*infisicalClient, error) {
	infisicalClientOnce.Do(func() {
		infisicalClientInstance, errInfisicalClient = initInfisicalClient()
	})
	return infisicalClientInstance, errInfisicalClient
}

func initInfisicalClient() (*infisicalClient, error) {
	clientID := os.Getenv(EnvInfisicalTestClientID)
	clientSecret := os.Getenv(EnvInfisicalTestClientSecret)
	projectID := os.Getenv(EnvInfisicalTestProjectID)

	if clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf(
			"skipping: Infisical test credentials not configured. "+
				"Set %s and %s environment variables to enable cloud provider tests",
			EnvInfisicalTestClientID, EnvInfisicalTestClientSecret,
		)
	}

	if projectID == "" {
		return nil, fmt.Errorf(
			"skipping: Infisical test project not configured. "+
				"Set %s environment variable to enable cloud provider tests",
			EnvInfisicalTestProjectID,
		)
	}

	apiURL := os.Getenv(EnvInfisicalTestAPIURL)
	if apiURL == "" {
		apiURL = DefaultInfisicalAPIURL
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}

	accessToken, err := authenticate(context.Background(), httpClient, apiURL, clientID, clientSecret)
	if err != nil {
		return nil, fmt.Errorf("skipping: failed to authenticate with Infisical: %w", err)
	}

	return &infisicalClient{
		httpClient:  httpClient,
		apiURL:      apiURL,
		accessToken: accessToken,
		projectID:   projectID,
	}, nil
}

// authenticate performs universal auth login and returns an access token.
func authenticate(ctx context.Context, client *http.Client, apiURL, clientID, clientSecret string) (string, error) {
	loginURL := apiURL + "/api/v1/auth/universal-auth/login"

	form := url.Values{}
	form.Set("clientId", clientID)
	form.Set("clientSecret", clientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, loginURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("creating login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // response body close errors are not actionable

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("login returned status %d", resp.StatusCode)
	}

	var loginResp struct {
		AccessToken string `json:"accessToken"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		return "", fmt.Errorf("decoding login response: %w", err)
	}

	return loginResp.AccessToken, nil
}

// listSecrets fetches secrets from the specified path.
func (c *infisicalClient) listSecrets(ctx context.Context, secretPath string) (map[string]string, error) {
	secretsURL := fmt.Sprintf("%s/api/v3/secrets/raw?workspaceId=%s&environment=%s&secretPath=%s",
		c.apiURL,
		url.QueryEscape(c.projectID),
		url.QueryEscape(TestEnvironment),
		url.QueryEscape(secretPath),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, secretsURL, http.NoBody)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.accessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("secrets request failed: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // response body close errors are not actionable

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("secrets request returned status %d", resp.StatusCode)
	}

	var secretsResp struct {
		Secrets []struct {
			SecretKey   string `json:"secretKey"`
			SecretValue string `json:"secretValue"`
		} `json:"secrets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&secretsResp); err != nil {
		return nil, fmt.Errorf("decoding secrets response: %w", err)
	}

	secretMap := make(map[string]string, len(secretsResp.Secrets))
	for _, s := range secretsResp.Secrets {
		secretMap[s.SecretKey] = s.SecretValue
	}

	return secretMap, nil
}

// InfisicalSecrets provides access to test secrets from a specific folder path.
type InfisicalSecrets struct {
	secrets map[string]string
}

var (
	platformSecretsOnce     sync.Once
	platformSecretsInstance *InfisicalSecrets
	errPlatformSecrets      error

	secretManagerSecretsOnce     sync.Once
	secretManagerSecretsInstance *InfisicalSecrets
	errSecretManagerSecrets      error
)

// GetPlatformSecrets returns secrets from the /platform folder.
// Skips the test if credentials are not configured.
func GetPlatformSecrets(t *testing.T) *InfisicalSecrets {
	t.Helper()

	platformSecretsOnce.Do(func() {
		platformSecretsInstance, errPlatformSecrets = loadSecrets(SecretPathPlatform)
	})

	if errPlatformSecrets != nil {
		t.Skip(errPlatformSecrets.Error())
	}

	return platformSecretsInstance
}

// GetSecretManagerSecrets returns secrets from the /secretmanager folder.
// Skips the test if credentials are not configured.
func GetSecretManagerSecrets(t *testing.T) *InfisicalSecrets {
	t.Helper()

	secretManagerSecretsOnce.Do(func() {
		secretManagerSecretsInstance, errSecretManagerSecrets = loadSecrets(SecretPathSecretManager)
	})

	if errSecretManagerSecrets != nil {
		t.Skip(errSecretManagerSecrets.Error())
	}

	return secretManagerSecretsInstance
}

func loadSecrets(path string) (*InfisicalSecrets, error) {
	client, err := getInfisicalClient()
	if err != nil {
		return nil, err
	}

	secrets, err := client.listSecrets(context.Background(), path)
	if err != nil {
		return nil, fmt.Errorf("skipping: failed to list secrets from %s: %w", path, err)
	}

	return &InfisicalSecrets{secrets: secrets}, nil
}

// Get returns a secret value by key. Returns empty string if not found.
func (s *InfisicalSecrets) Get(key string) string {
	return s.secrets[key]
}

// Require returns a secret value by key, or skips the test if not found.
func (s *InfisicalSecrets) Require(t *testing.T, key string) string {
	t.Helper()
	value, ok := s.secrets[key]
	if !ok || value == "" {
		t.Skipf("skipping: required secret %q not found in Infisical test project", key)
	}
	return value
}

// Has returns true if the secret exists and is non-empty.
func (s *InfisicalSecrets) Has(key string) bool {
	value, ok := s.secrets[key]
	return ok && value != ""
}
