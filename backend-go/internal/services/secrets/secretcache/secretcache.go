package secretcache

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/cache"
	"github.com/infisical/api/internal/libs/jitter"
	"github.com/infisical/api/internal/services/kms"
)

const (
	listSecretsCachePrefix   = "secret-manager"
	listSecretsTable         = "secrets_v2"
	listSecretsCacheTTL      = 10 * time.Minute
	listSecretsCacheJitter   = 2 * time.Minute
	listSecretsEtagTTL       = 15 * time.Minute
	listSecretsMaxCacheBytes = 25 * 1024 * 1024 // 25MB
)

// KeyStore provides the subset of keystore operations needed for caching.
type KeyStore interface {
	GetItem(ctx context.Context, key string) (string, error)
	SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
	SetExpiry(ctx context.Context, key string, expiry time.Duration) (bool, error)
	DeleteItem(ctx context.Context, key string) (int64, error)
	HashGet(ctx context.Context, key, field string) (string, error)
	HashSet(ctx context.Context, key, field, value string) error
	PgGetIntItem(ctx context.Context, key string) (int64, error)
}

// ListSecretsCacheParams holds parameters for list secrets cache operations.
type ListSecretsCacheParams struct {
	ProjectID             string
	ActorID               uuid.UUID
	PermissionFingerprint string
	PermissionRulesHash   string
	RequestParamsHash     string
	IfNoneMatch           string
}

// ListSecretsCacheResult represents the result of a list secrets cache check.
type ListSecretsCacheResult struct {
	Response    json.RawMessage
	ETag        string
	NotModified bool
}

// Deps holds the dependencies for the secret cache service.
type Deps struct {
	KeyStore KeyStore
}

// Service provides caching for secrets operations.
type Service struct {
	logger   *slog.Logger
	keyStore KeyStore
}

// NewService creates a new secret cache service.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger:   logger.With(slog.String("service", "secretcache")),
		keyStore: deps.KeyStore,
	}
}

// CheckListSecrets checks for a cached list secrets response or ETag match.
// Returns nil if no cache hit.
func (s *Service) CheckListSecrets(
	ctx context.Context,
	params *ListSecretsCacheParams,
	cipherPair *kms.CipherPair,
) (*ListSecretsCacheResult, error) {
	etagField := s.listSecretsEtagField(params)
	etagKey := s.listSecretsEtagKey(params.ProjectID)

	// Check If-None-Match first (fast path)
	if params.IfNoneMatch != "" {
		storedEtag, err := s.keyStore.HashGet(ctx, etagKey, etagField)
		if err != nil {
			return nil, fmt.Errorf("getting etag from cache: %w", err)
		}
		if storedEtag != "" && storedEtag == params.IfNoneMatch {
			return &ListSecretsCacheResult{
				NotModified: true,
				ETag:        params.IfNoneMatch,
			}, nil
		}
	}

	// Get DAL version for cache key
	version, err := s.keyStore.PgGetIntItem(ctx, s.listSecretsDalVersionKey(params.ProjectID))
	if err != nil {
		return nil, fmt.Errorf("getting dal version from cache: %w", err)
	}

	cacheKey := s.listSecretsCacheKey(params, version)

	encryptedPayload, err := s.keyStore.GetItem(ctx, cacheKey)
	if err != nil {
		return nil, fmt.Errorf("getting cached secrets: %w", err)
	}
	if encryptedPayload == "" {
		return nil, nil
	}

	// Decode and decrypt
	cipherBytes, err := base64.StdEncoding.DecodeString(encryptedPayload)
	if err != nil {
		s.deleteCorruptedEntry(ctx, cacheKey)
		return nil, fmt.Errorf("decoding cached payload: %w", err)
	}

	plaintext, err := cipherPair.Decrypt(cipherBytes)
	if err != nil {
		s.deleteCorruptedEntry(ctx, cacheKey)
		return nil, fmt.Errorf("decrypting cached payload: %w", err)
	}

	// Refresh TTL on hit
	if _, err := s.keyStore.SetExpiry(ctx, cacheKey, jitter.Apply(listSecretsCacheTTL, listSecretsCacheJitter)); err != nil {
		return nil, fmt.Errorf("refreshing cache ttl: %w", err)
	}

	// Compute and store ETag
	etag := s.computeETag(plaintext)
	if err := s.keyStore.HashSet(ctx, etagKey, etagField, etag); err != nil {
		return nil, fmt.Errorf("storing etag: %w", err)
	}
	if _, err := s.keyStore.SetExpiry(ctx, etagKey, listSecretsEtagTTL); err != nil {
		return nil, fmt.Errorf("setting etag expiry: %w", err)
	}

	return &ListSecretsCacheResult{
		Response: plaintext,
		ETag:     etag,
	}, nil
}

// WriteListSecrets caches a list secrets response and returns the ETag.
func (s *Service) WriteListSecrets(
	ctx context.Context,
	params *ListSecretsCacheParams,
	cipherPair *kms.CipherPair,
	response any,
) (string, error) {
	jsonBytes, err := json.Marshal(response)
	if err != nil {
		return "", fmt.Errorf("marshaling response: %w", err)
	}

	etag := s.computeETag(jsonBytes)

	version, err := s.keyStore.PgGetIntItem(ctx, s.listSecretsDalVersionKey(params.ProjectID))
	if err != nil {
		return etag, fmt.Errorf("getting dal version: %w", err)
	}

	etagField := s.listSecretsEtagField(params)
	etagKey := s.listSecretsEtagKey(params.ProjectID)
	cacheKey := s.listSecretsCacheKey(params, version)

	encrypted, err := cipherPair.Encrypt(jsonBytes)
	if err != nil {
		return etag, fmt.Errorf("encrypting payload: %w", err)
	}

	// Only cache if under size limit
	if len(encrypted) < listSecretsMaxCacheBytes {
		encodedPayload := base64.StdEncoding.EncodeToString(encrypted)
		if err := s.keyStore.SetItemWithExpiry(ctx, cacheKey, jitter.Apply(listSecretsCacheTTL, listSecretsCacheJitter), encodedPayload); err != nil {
			return etag, fmt.Errorf("storing cached secrets: %w", err)
		}
	}

	// Store ETag
	if err := s.keyStore.HashSet(ctx, etagKey, etagField, etag); err != nil {
		return etag, fmt.Errorf("storing etag: %w", err)
	}
	if _, err := s.keyStore.SetExpiry(ctx, etagKey, listSecretsEtagTTL); err != nil {
		return etag, fmt.Errorf("setting etag expiry: %w", err)
	}

	return etag, nil
}

// BuildListSecretsRequestParamsHash creates a hash from list secrets request parameters.
func BuildListSecretsRequestParamsHash(params map[string]any) string {
	return cache.GenerateHash(params)
}

func (s *Service) listSecretsDalVersionKey(projectID string) string {
	return listSecretsCachePrefix + ":" + projectID + ":" + listSecretsTable + "-dal-version"
}

func (s *Service) listSecretsEtagKey(projectID string) string {
	return "secret-etag:" + projectID + ":" + utcDayStamp()
}

func (s *Service) listSecretsCacheKey(params *ListSecretsCacheParams, version int64) string {
	return listSecretsCachePrefix + ":" + params.ProjectID + ":" + listSecretsTable + "-dal:v" +
		strconv.FormatInt(version, 10) + ":get-secrets-service-layer:" +
		params.ActorID.String() + "-" + params.PermissionFingerprint + "-" +
		params.PermissionRulesHash + "-" + params.RequestParamsHash
}

func (s *Service) listSecretsEtagField(params *ListSecretsCacheParams) string {
	return params.ActorID.String() + ":" + params.PermissionFingerprint + ":" + params.RequestParamsHash
}

func (s *Service) computeETag(data []byte) string {
	return `"` + cache.HashBytes(data) + `"`
}

func (s *Service) deleteCorruptedEntry(ctx context.Context, key string) {
	if _, err := s.keyStore.DeleteItem(ctx, key); err != nil {
		s.logger.WarnContext(ctx, "failed to delete corrupted cache entry", slog.Any("error", err))
	}
}

func utcDayStamp() string {
	return time.Now().UTC().Format("20060102")
}
