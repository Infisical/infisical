package license

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/config"
	"github.com/infisical/api/internal/database/pg"
)

//go:embed keys/license_public_key.pem
var licensePublicKeyPEM []byte

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

const syncInterval = 10 * time.Minute

// Service manages license validation and feature gating.
type Service struct {
	logger       *slog.Logger
	instanceType InstanceType
	isValid      bool

	mu             sync.RWMutex
	onPremFeatures FeatureSet
	offlineLicense *OfflineLicenseInfo

	db        pg.DB
	keyStore  keyStore
	cloudAPI  *licenseAPI
	onPremAPI *licenseAPI

	stopSync context.CancelFunc
}

// Deps holds the dependencies for the license shared service.
type Deps struct {
	Config   *config.Config
	DB       pg.DB
	KeyStore keyStore
}

func NewService(ctx context.Context, logger *slog.Logger, deps *Deps) *Service {
	svc := &Service{
		logger:         logger.With(slog.String("svc", "license")),
		onPremFeatures: DefaultFeatures(),
		db:             deps.DB,
		keyStore:       deps.KeyStore,
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

// verifySignatureWithKey verifies an RSA-SHA256 signature using the provided public key.
func verifySignatureWithKey(data []byte, signatureBase64 string, pubKey *rsa.PublicKey) error {
	signature, err := base64.StdEncoding.DecodeString(signatureBase64)
	if err != nil {
		return fmt.Errorf("decoding signature: %w", err)
	}

	hash := sha256.Sum256(data)

	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], signature); err != nil {
		return fmt.Errorf("signature verification failed: %w", err)
	}

	return nil
}

var (
	cachedLicensePubKey     *rsa.PublicKey
	cachedLicensePubKeyOnce sync.Once
	errCachedLicensePubKey  error
)

// parseLicensePublicKey parses the embedded license public key.
func parseLicensePublicKey() (*rsa.PublicKey, error) {
	block, _ := pem.Decode(licensePublicKeyPEM)
	if block == nil {
		return nil, errors.New("failed to parse PEM block containing public key")
	}

	pubKey, err := x509.ParsePKCS1PublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parsing public key: %w", err)
	}

	return pubKey, nil
}

// verifyOfflineLicenseSignature verifies the RSA-SHA256 signature of the license.
// This matches the Node.js implementation in backend/src/lib/crypto/signing.ts.
func verifyOfflineLicenseSignature(licenseJSON []byte, signatureBase64 string) error {
	cachedLicensePubKeyOnce.Do(func() {
		cachedLicensePubKey, errCachedLicensePubKey = parseLicensePublicKey()
	})
	if errCachedLicensePubKey != nil {
		return errCachedLicensePubKey
	}

	return verifySignatureWithKey(licenseJSON, signatureBase64, cachedLicensePubKey)
}

// loadOfflineLicense decodes a base64 offline license, verifies signature, checks expiration, and loads features.
func (s *Service) loadOfflineLicense(key string) error {
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return fmt.Errorf("decoding offline license: %w", err)
	}

	// Parse to get raw license JSON for signature verification.
	var rawContents struct {
		License   json.RawMessage `json:"license"`
		Signature string          `json:"signature"`
	}
	if err := json.Unmarshal(decoded, &rawContents); err != nil {
		return fmt.Errorf("parsing offline license: %w", err)
	}

	// Verify RSA-SHA256 signature (matches Node.js verifyOfflineLicense).
	if err := verifyOfflineLicenseSignature(rawContents.License, rawContents.Signature); err != nil {
		return fmt.Errorf("offline license verification failed: %w", err)
	}

	// Parse the license contents.
	var contents OfflineLicenseContents
	if err := json.Unmarshal(decoded, &contents); err != nil {
		return fmt.Errorf("parsing offline license contents: %w", err)
	}

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
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onPremFeatures = resp.CurrentPlan
	return nil
}

// orgDetails holds the org fields needed for license lookups.
type orgDetails struct {
	ID         string
	CustomerID sql.Null[string]
	RootOrgID  sql.Null[string]
}

// findRootOrgDetails resolves the root org for the given orgID and returns its customer ID.
// If the org has a rootOrgId, the root org is returned instead.
func (s *Service) findRootOrgDetails(ctx context.Context, orgID string) (*orgDetails, error) {
	query := `SELECT id, customer_id, root_org_id FROM organizations WHERE id = @orgID`
	args := pgx.NamedArgs{"orgID": orgID}

	row := s.db.Primary().QueryRow(ctx, query, args)

	var org orgDetails
	err := row.Scan(&org.ID, &org.CustomerID, &org.RootOrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("findRootOrgDetails: %w", err)
	}

	// If the org has a root org, resolve it.
	if org.RootOrgID.Valid && org.RootOrgID.V != "" && org.RootOrgID.V != org.ID {
		args["orgID"] = org.RootOrgID.V
		row = s.db.Primary().QueryRow(ctx, query, args)

		var rootOrg orgDetails
		err := row.Scan(&rootOrg.ID, &rootOrg.CustomerID, &rootOrg.RootOrgID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("findRootOrgDetails (root): %w", err)
		}
		return &rootOrg, nil
	}

	return &org, nil
}

// GetPlan returns the feature set for a given organization.
// For cloud instances it uses Redis caching + license server API.
// For on-prem instances it returns the in-memory feature set.
func (s *Service) GetPlan(ctx context.Context, orgID string) (*FeatureSet, error) {
	if s.instanceType != InstanceTypeCloud {
		s.mu.RLock()
		defer s.mu.RUnlock()
		features := s.onPremFeatures
		return &features, nil
	}

	// Cloud path: check cache first.
	cacheKey := planCachePrefix + orgID
	cached, err := s.keyStore.GetItem(ctx, cacheKey)
	if err == nil && cached != "" {
		var plan FeatureSet
		if unmarshalErr := json.Unmarshal([]byte(cached), &plan); unmarshalErr != nil {
			s.logger.WarnContext(ctx, "cached plan unmarshal failed, will fetch fresh",
				slog.String("orgID", orgID),
				slog.Any("error", unmarshalErr))
		} else {
			return &plan, nil
		}
	}

	// Cache miss — fetch from license server.
	org, err := s.findRootOrgDetails(ctx, orgID)
	if err != nil {
		return s.fallbackPlan(ctx, cacheKey), nil //nolint:nilerr // intentional fallback on DB error
	}
	if org == nil || !org.CustomerID.Valid || org.CustomerID.V == "" {
		return s.fallbackPlan(ctx, cacheKey), nil
	}

	var resp struct {
		CurrentPlan FeatureSet `json:"currentPlan"`
	}
	endpoint := fmt.Sprintf("/api/license-server/v1/customers/%s/cloud-plan", org.CustomerID.V)
	if err := s.cloudAPI.get(ctx, endpoint, &resp); err != nil {
		s.logger.ErrorContext(ctx, "failed to fetch cloud plan", slog.String("orgID", orgID), slog.Any("error", err))
		return s.fallbackPlan(ctx, cacheKey), nil
	}

	plan := resp.CurrentPlan

	// Cache the result.
	if planJSON, err := json.Marshal(plan); err == nil {
		if err := s.keyStore.SetItemWithExpiry(ctx, cacheKey, cloudPlanTTL, string(planJSON)); err != nil {
			s.logger.WarnContext(ctx, "failed to cache cloud plan", slog.String("cacheKey", cacheKey), slog.Any("error", err))
		}
	}

	return &plan, nil
}

// fallbackPlan caches and returns the default on-prem features when cloud fetch fails.
func (s *Service) fallbackPlan(ctx context.Context, cacheKey string) *FeatureSet {
	s.mu.RLock()
	features := s.onPremFeatures
	s.mu.RUnlock()
	if planJSON, err := json.Marshal(features); err == nil {
		if err := s.keyStore.SetItemWithExpiry(ctx, cacheKey, cloudPlanTTL, string(planJSON)); err != nil {
			s.logger.WarnContext(ctx, "failed to cache fallback plan", slog.String("cacheKey", cacheKey), slog.Any("error", err))
		}
	}
	return &features
}

// RefreshPlan clears the cached plan for an org and re-fetches it.
func (s *Service) RefreshPlan(ctx context.Context, orgID string) error {
	cacheKey := planCachePrefix + orgID
	if _, err := s.keyStore.DeleteItem(ctx, cacheKey); err != nil {
		s.logger.WarnContext(ctx, "failed to delete cached plan", slog.String("cacheKey", cacheKey), slog.Any("error", err))
	}

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

// GetOnPremFeatures returns a copy of the on-prem feature set.
// For cloud instances, this returns the default features (use GetPlan for org-specific features).
func (s *Service) GetOnPremFeatures() FeatureSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.onPremFeatures
}
