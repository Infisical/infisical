package secret

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/cache"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
)

const (
	listSecretsCachePrefix   = "secret-manager"
	listSecretsTable         = "secrets_v2"
	listSecretsDalVersionTTL = 15 * time.Minute
	listSecretsCacheTTL      = 10 * time.Minute
	listSecretsCacheJitter   = 2 * time.Minute
	listSecretsEtagTTL       = 15 * time.Minute
	listSecretsMaxCacheBytes = 25 * 1024 * 1024 // 25MB
)

// listSecretsCacheParams holds parameters needed for cache operations.
type listSecretsCacheParams struct {
	ProjectID             string
	OrgID                 uuid.UUID
	ActorID               uuid.UUID
	ActorType             auth.ActorType
	PermissionFingerprint string
	PermissionRulesHash   string
	RequestParams         *listSecretsInternalOpts
	IfNoneMatch           string
}

func listSecretsDalVersionKey(projectID string) string {
	return listSecretsCachePrefix + ":" + projectID + ":" + listSecretsTable + "-dal-version"
}

func listSecretsEtagKey(projectID string) string {
	return "secret-etag:" + projectID + ":" + listSecretsUtcDayStamp()
}

func listSecretsServiceLayerCacheKey(
	projectID string,
	version int64,
	actorID uuid.UUID,
	permissionFingerprint string,
	permissionHash string,
	requestParamsHash string,
) string {
	return listSecretsCachePrefix + ":" + projectID + ":" + listSecretsTable + "-dal:v" +
		strconv.FormatInt(version, 10) + ":get-secrets-service-layer:" +
		actorID.String() + "-" + permissionFingerprint + "-" + permissionHash + "-" + requestParamsHash
}

func listSecretsUtcDayStamp() string {
	return time.Now().UTC().Format("20060102")
}

func listSecretsApplyCacheJitter(base, jitter time.Duration) time.Duration {
	jitterSeconds := rand.Int64N(int64(jitter.Seconds()))
	return base + time.Duration(jitterSeconds)*time.Second
}

func (h *Handler) listSecretsBuildRequestParamsHash(opts *listSecretsInternalOpts) string {
	return cache.GenerateHash(map[string]any{
		"environment":               opts.Environment,
		"path":                      opts.SecretPath,
		"recursive":                 opts.Recursive,
		"includeImports":            opts.IncludeImports,
		"expandSecretReferences":    opts.ExpandSecretReferences,
		"viewSecretValue":           opts.ViewSecretValue,
		"personalOverridesBehavior": opts.PersonalOverridesBehavior,
		"tagSlugs":                  opts.TagSlugs,
		"metadataFilter":            opts.MetadataFilter,
	})
}

func (h *Handler) listSecretsCheckCache(
	ctx context.Context,
	params *listSecretsCacheParams,
	cipherPair *kms.CipherPair,
) (*listSecretsResponseWithETag, error) {
	requestParamsHash := h.listSecretsBuildRequestParamsHash(params.RequestParams)

	etagField := params.ActorID.String() + ":" + params.PermissionFingerprint + ":" + requestParamsHash
	etagKey := listSecretsEtagKey(params.ProjectID)

	if params.IfNoneMatch != "" {
		storedEtag, err := h.keyStore.HashGet(ctx, etagKey, etagField)
		if err != nil {
			return nil, fmt.Errorf("getting etag from cache: %w", err)
		}
		if storedEtag != "" && storedEtag == params.IfNoneMatch {
			return &listSecretsResponseWithETag{
				NotModified: true,
				ETag:        params.IfNoneMatch,
			}, nil
		}
	}

	version, err := h.keyStore.PgGetIntItem(ctx, listSecretsDalVersionKey(params.ProjectID))
	if err != nil {
		return nil, fmt.Errorf("getting dal version from cache: %w", err)
	}

	cacheKey := listSecretsServiceLayerCacheKey(
		params.ProjectID,
		version,
		params.ActorID,
		params.PermissionFingerprint,
		params.PermissionRulesHash,
		requestParamsHash,
	)

	encryptedPayload, err := h.keyStore.GetItem(ctx, cacheKey)
	if err != nil {
		return nil, fmt.Errorf("getting cached secrets: %w", err)
	}
	if encryptedPayload == "" {
		return nil, nil
	}

	cipherBytes, err := base64.StdEncoding.DecodeString(encryptedPayload)
	if err != nil {
		if _, delErr := h.keyStore.DeleteItem(ctx, cacheKey); delErr != nil {
			h.logger.WarnContext(ctx, "failed to delete corrupted cache entry", slog.Any("error", delErr))
		}
		return nil, fmt.Errorf("decoding cached payload: %w", err)
	}

	plaintext, err := cipherPair.Decrypt(cipherBytes)
	if err != nil {
		if _, delErr := h.keyStore.DeleteItem(ctx, cacheKey); delErr != nil {
			h.logger.WarnContext(ctx, "failed to delete corrupted cache entry", slog.Any("error", delErr))
		}
		return nil, fmt.Errorf("decrypting cached payload: %w", err)
	}

	var cached listSecretsResponse
	if err := json.Unmarshal(plaintext, &cached); err != nil {
		if _, delErr := h.keyStore.DeleteItem(ctx, cacheKey); delErr != nil {
			h.logger.WarnContext(ctx, "failed to delete corrupted cache entry", slog.Any("error", delErr))
		}
		return nil, fmt.Errorf("unmarshaling cached payload: %w", err)
	}

	if _, err := h.keyStore.SetExpiry(ctx, cacheKey, listSecretsApplyCacheJitter(listSecretsCacheTTL, listSecretsCacheJitter)); err != nil {
		return nil, fmt.Errorf("refreshing cache ttl: %w", err)
	}

	etag := `"` + cache.GenerateHash(&cached) + `"`
	if err := h.keyStore.HashSet(ctx, etagKey, etagField, etag); err != nil {
		return nil, fmt.Errorf("storing etag: %w", err)
	}
	if _, err := h.keyStore.SetExpiry(ctx, etagKey, listSecretsEtagTTL); err != nil {
		return nil, fmt.Errorf("setting etag expiry: %w", err)
	}

	return &listSecretsResponseWithETag{
		Response: &cached,
		ETag:     etag,
	}, nil
}

func (h *Handler) listSecretsWriteCache(
	ctx context.Context,
	params *listSecretsCacheParams,
	cipherPair *kms.CipherPair,
	response *listSecretsResponse,
) (string, error) {
	etag := `"` + cache.GenerateHash(response) + `"`

	version, err := h.keyStore.PgGetIntItem(ctx, listSecretsDalVersionKey(params.ProjectID))
	if err != nil {
		return etag, fmt.Errorf("getting dal version: %w", err)
	}

	requestParamsHash := h.listSecretsBuildRequestParamsHash(params.RequestParams)
	etagField := params.ActorID.String() + ":" + params.PermissionFingerprint + ":" + requestParamsHash
	etagKey := listSecretsEtagKey(params.ProjectID)
	cacheKey := listSecretsServiceLayerCacheKey(
		params.ProjectID,
		version,
		params.ActorID,
		params.PermissionFingerprint,
		params.PermissionRulesHash,
		requestParamsHash,
	)

	jsonBytes, err := json.Marshal(response)
	if err != nil {
		return etag, fmt.Errorf("marshaling response: %w", err)
	}

	encrypted, err := cipherPair.Encrypt(jsonBytes)
	if err != nil {
		return etag, fmt.Errorf("encrypting payload: %w", err)
	}

	if len(encrypted) < listSecretsMaxCacheBytes {
		encodedPayload := base64.StdEncoding.EncodeToString(encrypted)
		if err := h.keyStore.SetItemWithExpiry(ctx, cacheKey, listSecretsApplyCacheJitter(listSecretsCacheTTL, listSecretsCacheJitter), encodedPayload); err != nil {
			return etag, fmt.Errorf("storing cached secrets: %w", err)
		}
	}

	if err := h.keyStore.HashSet(ctx, etagKey, etagField, etag); err != nil {
		return etag, fmt.Errorf("storing etag: %w", err)
	}
	if _, err := h.keyStore.SetExpiry(ctx, etagKey, listSecretsEtagTTL); err != nil {
		return etag, fmt.Errorf("setting etag expiry: %w", err)
	}

	return etag, nil
}
