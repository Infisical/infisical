package license

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
)

// licenseAPI wraps a resty client with token-based auth and auto-refresh.
type licenseAPI struct {
	client    *resty.Client
	serverURL string
	loginPath string
	apiKey    string
	mu        sync.Mutex
}

func newLicenseAPI(serverURL, loginPath, apiKey, region string) *licenseAPI {
	api := &licenseAPI{
		serverURL: serverURL,
		loginPath: loginPath,
		apiKey:    apiKey,
	}

	api.client = resty.New().
		SetBaseURL(serverURL).
		SetTimeout(35*time.Second).
		SetHeader("Content-Type", "application/json")

	if region != "" {
		api.client.SetHeader("x-region", region)
	}

	return api
}

// refreshToken authenticates with the license server and stores the token.
func (api *licenseAPI) refreshToken(ctx context.Context) (string, error) {
	api.mu.Lock()
	defer api.mu.Unlock()

	var result struct {
		Token string `json:"token"`
	}

	resp, err := api.client.R().
		SetContext(ctx).
		SetHeader("X-API-KEY", api.apiKey).
		SetResult(&result).
		Post(api.loginPath)

	if err != nil {
		return "", fmt.Errorf("license token refresh: %w", err)
	}
	if resp.IsError() {
		return "", fmt.Errorf("license token refresh: status %d, body: %s", resp.StatusCode(), resp.String())
	}

	api.client.SetAuthToken(result.Token)
	return result.Token, nil
}

// get performs a GET with a single retry on 401/403 (token refresh).
func (api *licenseAPI) get(ctx context.Context, path string, result any) error {
	resp, err := api.client.R().SetContext(ctx).SetResult(result).Get(path)
	if err != nil {
		return err
	}

	if resp.StatusCode() == 401 || resp.StatusCode() == 403 {
		if _, refreshErr := api.refreshToken(ctx); refreshErr != nil {
			return refreshErr
		}
		resp, err = api.client.R().SetContext(ctx).SetResult(result).Get(path)
		if err != nil {
			return err
		}
	}

	if resp.IsError() {
		return fmt.Errorf("license server GET %s: status %d", path, resp.StatusCode())
	}
	return nil
}
