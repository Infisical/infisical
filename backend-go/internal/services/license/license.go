package license

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"

	"github.com/infisical/api/internal/config"
)

const (
	cloudLoginPath  = "/api/auth/v1/license-server-login"
	onPremLoginPath = "/api/auth/v1/license-login"

	cloudPlanTTL    = 5 * time.Minute
	planCachePrefix = "infisical-cloud-plan-"
)

// keyStore is the narrow interface this service needs for caching.
type keyStore interface {
	GetItem(ctx context.Context, key string) (string, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	DeleteItem(ctx context.Context, key string) (int64, error)
}

// dal is the narrow interface for org lookups needed by getPlan.
type dal interface {
	FindRootOrgDetails(ctx context.Context, orgID string) (*orgRow, error)
}

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
		SetTimeout(35 * time.Second)

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

	resp, err := resty.New().R().
		SetContext(ctx).
		SetHeader("X-API-KEY", api.apiKey).
		SetResult(&result).
		Post(api.serverURL + api.loginPath)
	if err != nil {
		return "", fmt.Errorf("license token refresh: %w", err)
	}
	if resp.IsError() {
		return "", fmt.Errorf("license token refresh: status %d", resp.StatusCode())
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

const syncInterval = 10 * time.Minute

// Service manages license validation and feature gating.
type Service struct {
	logger         *slog.Logger
	instanceType   InstanceType
	isValid        bool
	onPremFeatures FeatureSet
	offlineLicense *OfflineLicenseInfo

	keyStore  keyStore
	dal       dal
	cloudAPI  *licenseAPI
	onPremAPI *licenseAPI

	stopSync context.CancelFunc
}

// Deps holds the dependencies for the license shared service.
type Deps struct {
	Config   *config.Config
	KeyStore keyStore
	DAL      dal
}

func NewService(ctx context.Context, logger *slog.Logger, deps Deps) *Service {
	svc := &Service{
		logger:         logger.With(slog.String("svc", "license")),
		onPremFeatures: DefaultFeatures(),
		keyStore:       deps.KeyStore,
		dal:            deps.DAL,
	}

	serverURL := deps.Config.LicenseServerURL
	if serverURL == "" {
		serverURL = "https://portal.infisical.com"
	}

	svc.cloudAPI = newLicenseAPI(serverURL, cloudLoginPath, deps.Config.LicenseServerKey, "")
	svc.onPremAPI = newLicenseAPI(serverURL, onPremLoginPath, "", "")

	svc.init(ctx, deps.Config)
	svc.startBackgroundSync()
	return svc
}

func (s *Service) init(ctx context.Context, cfg *config.Config) {
	defer func() {
		if r := recover(); r != nil {
			s.logger.ErrorContext(ctx, "panic during license init", slog.Any("recover", r))
		}
	}()

	// 1. Cloud instance (LICENSE_SERVER_KEY is set).
	if cfg.LicenseServerKey != "" {
		token, err := s.cloudAPI.refreshToken(ctx)
		if err != nil {
			s.logger.ErrorContext(ctx, "cloud license login failed", slog.Any("error", err))
			s.isValid = true // allow OSS fallback
			return
		}
		if token != "" {
			s.instanceType = InstanceTypeCloud
		}
		s.logger.InfoContext(ctx, "license initialized", slog.String("instanceType", string(InstanceTypeCloud)))
		s.isValid = true
		return
	}

	// Determine license key type.
	licenseKey, licenseType := detectLicenseKey(cfg)

	// 2. Online enterprise license.
	if licenseKey != "" && licenseType == OnlineLicenseType {
		s.onPremAPI.apiKey = licenseKey
		token, err := s.onPremAPI.refreshToken(ctx)
		if err != nil {
			s.logger.ErrorContext(ctx, "on-prem license login failed", slog.Any("error", err))
			s.isValid = true
			return
		}
		if token != "" {
			if err := s.syncOnPremFeatures(ctx); err != nil {
				s.logger.ErrorContext(ctx, "initial on-prem feature sync failed", slog.Any("error", err))
			}
			s.instanceType = InstanceTypeEnterpriseOnPrem
			s.logger.InfoContext(ctx, "license initialized", slog.String("instanceType", string(InstanceTypeEnterpriseOnPrem)))
			s.isValid = true
		}
		return
	}

	// 3. Offline enterprise license.
	if licenseKey != "" && licenseType == OfflineLicenseType {
		if err := s.loadOfflineLicense(licenseKey); err != nil {
			s.logger.WarnContext(ctx, "offline license validation failed", slog.Any("error", err))
		} else {
			s.instanceType = InstanceTypeEnterpriseOnPremOffline
			s.logger.InfoContext(ctx, "license initialized", slog.String("instanceType", string(InstanceTypeEnterpriseOnPremOffline)))
			s.isValid = true
			return
		}
	}

	// 4. Self-hosted OSS fallback.
	s.instanceType = InstanceTypeOnPrem
	s.isValid = true
	s.logger.InfoContext(ctx, "license initialized", slog.String("instanceType", string(InstanceTypeOnPrem)))
}

// detectLicenseKey determines the license key and its type (online/offline).
func detectLicenseKey(cfg *config.Config) (key string, typ LicenseType) {
	raw := cfg.LicenseKey
	if raw == "" {
		raw = cfg.LicenseKeyOffline
	}
	if raw == "" {
		return "", ""
	}

	if isOfflineKey(raw) {
		return raw, OfflineLicenseType
	}
	return raw, OnlineLicenseType
}

// isOfflineKey checks if the key is base64-encoded JSON containing "signature" and "license".
func isOfflineKey(key string) bool {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return false
	}
	var contents struct {
		Signature string          `json:"signature"`
		License   json.RawMessage `json:"license"`
	}
	if err := json.Unmarshal(decoded, &contents); err != nil {
		return false
	}
	return contents.Signature != "" && len(contents.License) > 0
}

// loadOfflineLicense decodes a base64 offline license, checks expiration, and loads features.
func (s *Service) loadOfflineLicense(key string) error {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return fmt.Errorf("decoding offline license: %w", err)
	}

	var contents OfflineLicenseContents
	if err := json.Unmarshal(decoded, &contents); err != nil {
		return fmt.Errorf("parsing offline license: %w", err)
	}

	// TODO: verify RSA signature against embedded public key.

	// Check termination date.
	if contents.License.TerminatesAt != nil {
		terminatesAt, err := time.Parse(time.RFC3339, *contents.License.TerminatesAt)
		if err != nil {
			return fmt.Errorf("parsing terminatesAt: %w", err)
		}
		if time.Now().After(terminatesAt) {
			return fmt.Errorf("offline license expired at %s", terminatesAt)
		}
	}

	// Unmarshal features from the license.
	var features FeatureSet
	if err := json.Unmarshal(contents.License.Features, &features); err != nil {
		return fmt.Errorf("parsing offline license features: %w", err)
	}
	enterprise := "enterprise"
	features.Slug = &enterprise

	s.onPremFeatures = features
	s.offlineLicense = &contents.License
	return nil
}

// syncOnPremFeatures fetches the current plan from the on-prem license server.
func (s *Service) syncOnPremFeatures(ctx context.Context) error {
	var resp struct {
		CurrentPlan FeatureSet `json:"currentPlan"`
	}
	if err := s.onPremAPI.get(ctx, "/api/license/v1/plan", &resp); err != nil {
		return err
	}
	s.onPremFeatures = resp.CurrentPlan
	return nil
}

// GetPlan returns the feature set for a given organization.
// For cloud instances it uses Redis caching + license server API.
// For on-prem instances it returns the in-memory feature set.
func (s *Service) GetPlan(ctx context.Context, orgID string) (*FeatureSet, error) {
	if s.instanceType != InstanceTypeCloud {
		features := s.onPremFeatures
		return &features, nil
	}

	// Cloud path: check cache first.
	cacheKey := planCachePrefix + orgID
	cached, err := s.keyStore.GetItem(ctx, cacheKey)
	if err == nil && cached != "" {
		var plan FeatureSet
		if err := json.Unmarshal([]byte(cached), &plan); err == nil {
			return &plan, nil
		}
	}

	// Cache miss — fetch from license server.
	org, err := s.dal.FindRootOrgDetails(ctx, orgID)
	if err != nil {
		return s.fallbackPlan(ctx, cacheKey), nil //nolint:nilerr // intentional fallback on DB error
	}
	if org == nil || !org.CustomerID.Valid || org.CustomerID.String == "" {
		return s.fallbackPlan(ctx, cacheKey), nil
	}

	var resp struct {
		CurrentPlan FeatureSet `json:"currentPlan"`
	}
	endpoint := fmt.Sprintf("/api/license-server/v1/customers/%s/cloud-plan", org.CustomerID.String)
	if err := s.cloudAPI.get(ctx, endpoint, &resp); err != nil {
		s.logger.ErrorContext(ctx, "failed to fetch cloud plan", slog.String("orgID", orgID), slog.Any("error", err))
		return s.fallbackPlan(ctx, cacheKey), nil
	}

	plan := resp.CurrentPlan

	// Cache the result.
	if planJSON, err := json.Marshal(plan); err == nil {
		_ = s.keyStore.SetItemWithExpiry(ctx, cacheKey, cloudPlanTTL, string(planJSON))
	}

	return &plan, nil
}

// fallbackPlan caches and returns the default on-prem features when cloud fetch fails.
func (s *Service) fallbackPlan(ctx context.Context, cacheKey string) *FeatureSet {
	features := s.onPremFeatures
	if planJSON, err := json.Marshal(features); err == nil {
		_ = s.keyStore.SetItemWithExpiry(ctx, cacheKey, cloudPlanTTL, string(planJSON))
	}
	return &features
}

// RefreshPlan clears the cached plan for an org and re-fetches it.
func (s *Service) RefreshPlan(ctx context.Context, orgID string) error {
	cacheKey := planCachePrefix + orgID
	_, _ = s.keyStore.DeleteItem(ctx, cacheKey)

	if s.instanceType == InstanceTypeCloud {
		_, err := s.GetPlan(ctx, orgID)
		return err
	}
	if s.instanceType == InstanceTypeEnterpriseOnPrem {
		return s.syncOnPremFeatures(ctx)
	}
	return nil
}

// startBackgroundSync launches a goroutine that re-syncs on-prem features
// every 10 minutes. Only runs for online enterprise on-prem instances.
func (s *Service) startBackgroundSync() {
	if s.instanceType != InstanceTypeEnterpriseOnPrem {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.stopSync = cancel

	s.logger.InfoContext(ctx, "starting background license sync", slog.Duration("interval", syncInterval))
	go func() {
		ticker := time.NewTicker(syncInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				s.logger.InfoContext(ctx, "background license sync stopped")
				return
			case <-ticker.C:
				if err := s.syncOnPremFeatures(ctx); err != nil {
					s.logger.ErrorContext(ctx, "background license sync failed", slog.Any("error", err))
				}
			}
		}
	}()
}

// Close stops the background sync goroutine if running.
func (s *Service) Close() {
	if s.stopSync != nil {
		s.stopSync()
	}
}

func (s *Service) GetInstanceType() InstanceType { return s.instanceType }
func (s *Service) IsValidLicense() bool          { return s.isValid }
