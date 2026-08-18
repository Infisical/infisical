package secret

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"strings"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	permsecretsvc "github.com/infisical/api/internal/services/permission/secretmanager"
	secretsvc "github.com/infisical/api/internal/services/secrets/secret"
	"github.com/infisical/api/internal/services/secrets/secretcache"
)

// PersonalOverridesBehavior controls how personal secret overrides are handled.
type PersonalOverridesBehavior int

const (
	// PersonalOverridesIncludeAll returns both shared and personal secrets (v3 behavior).
	PersonalOverridesIncludeAll PersonalOverridesBehavior = iota
	// PersonalOverridesNeverInclude returns only shared secrets.
	PersonalOverridesNeverInclude
	// PersonalOverridesPriority returns personal secrets when they exist, otherwise shared.
	PersonalOverridesPriority
)

// listSecretsInternalOpts are the unified options for listing secrets.
type listSecretsInternalOpts struct {
	ProjectID                 string
	Environment               string
	SecretPath                string
	UserID                    *uuid.UUID
	Recursive                 bool
	ViewSecretValue           bool
	ExpandSecretReferences    bool
	IncludeImports            bool
	PersonalOverridesBehavior PersonalOverridesBehavior
	TagSlugs                  []string
	MetadataFilter            []secretsvc.MetadataFilter
	IfNoneMatch               string
}

// listSecretsResponse is the internal response type for listing secrets.
type listSecretsResponse struct {
	Secrets []SecretRaw    `json:"secrets"`
	Imports []SecretImport `json:"imports,omitempty"`
}

// listSecretsResponseWithETag wraps the response with caching metadata.
type listSecretsResponseWithETag struct {
	Response    *listSecretsResponse
	ETag        string
	NotModified bool
}

// listSecrets is the unified internal method for listing secrets.
// Both V3 and V4 handlers call this with different options.
func (h *Handler) listSecrets(ctx context.Context, opts *listSecretsInternalOpts) (*listSecretsResponseWithETag, error) {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	var permissionFingerprint string
	if identity.Actor == auth.ActorTypeUser || identity.Actor == auth.ActorTypeIdentity {
		permissionFingerprint, err = h.permission.GetPermissionFingerprint(ctx, &permission.GetPermissionFingerprintArgs{
			ProjectID: opts.ProjectID,
			OrgID:     identity.OrgID,
			ActorID:   identity.ActorID,
			ActorType: identity.Actor,
		})
		if err != nil {
			h.logger.WarnContext(ctx, "failed to get permission fingerprint, proceeding without cache", slog.Any("error", err))
		}
	}

	permResult, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ProjectID:         opts.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return nil, err
	}
	checker := permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)

	cipherPair, err := h.kms.CreateCipherPairWithProjectDataKey(ctx, opts.ProjectID)
	if err != nil {
		return nil, err
	}

	requestParamsHash := secretcache.BuildListSecretsRequestParamsHash(map[string]any{
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

	cacheParams := &secretcache.ListSecretsCacheParams{
		ProjectID:             opts.ProjectID,
		ActorID:               identity.ActorID,
		PermissionFingerprint: permissionFingerprint,
		PermissionRulesHash:   permResult.PermissionRulesHash(),
		RequestParamsHash:     requestParamsHash,
		IfNoneMatch:           opts.IfNoneMatch,
	}

	cacheResult, err := h.secretCache.CheckListSecrets(ctx, cacheParams, cipherPair)
	if err != nil {
		h.logger.WarnContext(ctx, "cache check failed, proceeding without cache", slog.Any("error", err))
	} else if cacheResult != nil {
		if cacheResult.NotModified {
			return &listSecretsResponseWithETag{
				NotModified: true,
				ETag:        cacheResult.ETag,
			}, nil
		}
		var cached listSecretsResponse
		if err := json.Unmarshal(cacheResult.Response, &cached); err != nil {
			h.logger.WarnContext(ctx, "failed to unmarshal cached response, proceeding without cache", slog.Any("error", err))
		} else {
			return &listSecretsResponseWithETag{
				Response: &cached,
				ETag:     cacheResult.ETag,
			}, nil
		}
	}

	result, err := h.secrets.ListSecrets(ctx, &secretsvc.ListSecretsOpts{
		ProjectID:      opts.ProjectID,
		Environment:    opts.Environment,
		SecretPath:     opts.SecretPath,
		UserID:         opts.UserID,
		Recursive:      opts.Recursive,
		TagSlugs:       opts.TagSlugs,
		MetadataFilter: opts.MetadataFilter,
	})
	if err != nil {
		return nil, err
	}

	// Expand references (on permission-filtered pool to prevent leaking unauthorized secrets)
	if opts.ExpandSecretReferences {
		// Filter the expansion pool to only include secrets the user can read.
		// This prevents relative reference expansion (e.g., ${RESTRICTED}) from leaking
		// secret values that the user doesn't have permission to access.
		allSecrets := result.AllSecrets()
		filteredPool := make([]*secretsvc.ProcessedSecret, 0, len(allSecrets))
		for _, sec := range allSecrets {
			tagSlugs := make([]string, len(sec.Secret.Tags))
			for i, tag := range sec.Secret.Tags {
				tagSlugs[i] = tag.Slug
			}
			if checker.CanReadSecretValue(sec.Environment, sec.SecretPath, sec.Secret.Key, tagSlugs) {
				filteredPool = append(filteredPool, sec)
			}
		}

		expander := secretsvc.NewSecretExpander(filteredPool, secretsvc.ExpandOpts{
			CanAccessAbsolute: func(ref secretsvc.AbsoluteSecretRef, tags []string) bool {
				return checker.CanReadSecretValue(ref.Env, ref.Path, ref.Key, tags)
			},
			FetchAbsoluteSecrets: func(refs []secretsvc.AbsoluteSecretRef) []*secretsvc.ProcessedSecret {
				return h.secrets.FetchAbsoluteSecrets(ctx, refs, secretsvc.AbsoluteFetchOpts{
					ProjectID:    opts.ProjectID,
					FolderLookup: result.FolderLookup,
					CipherPair:   result.CipherPair,
					UserID:       opts.UserID,
				})
			},
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("denied refs: %v", expander.DeniedRefs())
		}
	}

	result.DirectSecrets = filterListSecretsByPermission(result.DirectSecrets, checker, opts)
	result.ImportedSecrets = filterListSecretsByPermission(result.ImportedSecrets, checker, opts)

	filterPersonalOverrides := func(secrets []secretsvc.ProcessedSecret) []secretsvc.ProcessedSecret {
		switch opts.PersonalOverridesBehavior {
		case PersonalOverridesIncludeAll:
			return secrets
		case PersonalOverridesNeverInclude:
			filtered := make([]secretsvc.ProcessedSecret, 0, len(secrets))
			for i := range secrets {
				if secrets[i].Secret.Type == "shared" {
					filtered = append(filtered, secrets[i])
				}
			}
			return filtered
		case PersonalOverridesPriority:
			secretMap := make(map[string]*secretsvc.ProcessedSecret, len(secrets))
			for i := range secrets {
				sec := &secrets[i]
				key := sec.Secret.Key + "-" + sec.Secret.FolderID.String()
				if existing, exists := secretMap[key]; !exists || (sec.Secret.Type == "personal" && existing.Secret.Type != "personal") {
					secretMap[key] = sec
				}
			}
			filtered := make([]secretsvc.ProcessedSecret, 0, len(secretMap))
			for _, sec := range secretMap {
				filtered = append(filtered, *sec)
			}
			// Sort by key to maintain consistent ordering (map iteration is random in Go)
			sort.Slice(filtered, func(i, j int) bool {
				return filtered[i].Secret.Key < filtered[j].Secret.Key
			})
			return filtered
		default:
			return secrets
		}
	}
	result.DirectSecrets = filterPersonalOverrides(result.DirectSecrets)
	result.ImportedSecrets = filterPersonalOverrides(result.ImportedSecrets)

	response := h.buildListSecretsResponse(result, opts.ProjectID, opts.IncludeImports)

	etag, err := h.secretCache.WriteListSecrets(ctx, cacheParams, cipherPair, response)
	if err != nil {
		h.logger.WarnContext(ctx, "cache write failed", slog.Any("error", err))
	}

	// TODO: Re-enable audit logging once Go backend is primary

	return &listSecretsResponseWithETag{
		Response: response,
		ETag:     etag,
	}, nil
}

func filterListSecretsByPermission(secrets []secretsvc.ProcessedSecret, checker *permsecretsvc.SecretAccessChecker, opts *listSecretsInternalOpts) []secretsvc.ProcessedSecret {
	filtered := make([]secretsvc.ProcessedSecret, 0, len(secrets))
	for i := range secrets {
		sec := &secrets[i]
		tagSlugs := make([]string, len(sec.Secret.Tags))
		for j, tag := range sec.Secret.Tags {
			tagSlugs[j] = tag.Slug
		}

		if !checker.CanDescribeSecret(sec.Environment, sec.SecretPath, sec.Secret.Key, tagSlugs) {
			continue
		}

		canReadValue := checker.CanReadSecretValue(sec.Environment, sec.SecretPath, sec.Secret.Key, tagSlugs)

		if opts.Recursive && opts.ViewSecretValue && sec.SecretPath != opts.SecretPath && !canReadValue {
			continue
		}

		if !opts.ViewSecretValue || !canReadValue {
			sec.ValueHidden = true
			sec.Value = "<hidden-by-infisical>"
		}

		filtered = append(filtered, *sec)
	}
	return filtered
}

// buildListSecretsResponse builds the response for ListSecretsV4.
func (h *Handler) buildListSecretsResponse(
	result *secretsvc.ListSecretsResult,
	projectID string,
	includeImports bool,
) *listSecretsResponse {
	secretsResponse := make([]SecretRaw, 0, len(result.DirectSecrets))
	for i := range result.DirectSecrets {
		secretsResponse = append(secretsResponse, h.buildSecretRaw(&result.DirectSecrets[i], projectID))
	}

	var importsResponse []SecretImport
	if includeImports {
		importsResponse = h.buildImportsResponse(result, projectID)
	}

	return &listSecretsResponse{
		Secrets: secretsResponse,
		Imports: importsResponse,
	}
}

// buildSecretRaw converts a ProcessedSecret to the API response type.
func (h *Handler) buildSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) SecretRaw {
	sec := ps.Secret

	tags := make([]SecretTag, 0, len(sec.Tags))
	for _, tag := range sec.Tags {
		t := SecretTag{
			ID:   tag.ID.String(),
			Slug: tag.Slug,
			Name: tag.Slug,
		}
		if tag.Color.Valid {
			t.Color = &tag.Color.V
		}
		tags = append(tags, t)
	}

	metadata := make([]ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, ResourceMetadata{
			Key:         m.Key,
			Value:       m.Value,
			IsEncrypted: m.IsEncrypted,
		})
	}

	isRotatedSecret := new(sec.IsRotatedSecret())
	var rotationID *string
	if sec.IsRotatedSecret() {
		rid := sec.GetRotationID().String()
		rotationID = &rid
	}

	var skipMultilineEncoding *bool
	if sec.SkipMultilineEncoding.Valid {
		skipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}

	raw := SecretRaw{
		ID:                    sec.ID.String(),
		UnderscoreID:          sec.ID.String(),
		Workspace:             projectID,
		Environment:           ps.Environment,
		Version:               int(sec.Version),
		Type:                  SecretRawType(sec.Type),
		SecretKey:             sec.Key,
		SecretValue:           ps.Value,
		SecretComment:         ps.Comment,
		SecretPath:            &ps.SecretPath,
		CreatedAt:             sec.CreatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:             sec.UpdatedAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		SecretValueHidden:     ps.ValueHidden,
		Tags:                  tags,
		SecretMetadata:        metadata,
		SkipMultilineEncoding: skipMultilineEncoding,
		IsRotatedSecret:       isRotatedSecret,
		RotationID:            rotationID,
	}

	if sec.ReminderNote.Valid {
		raw.SecretReminderNote = &sec.ReminderNote.V
	}
	if sec.ReminderRepeatDays.Valid {
		repeatDays := int(sec.ReminderRepeatDays.V)
		raw.SecretReminderRepeatDays = &repeatDays
	}

	return raw
}

// buildImportSecretRaw converts a ProcessedSecret to the import API response type.
func (h *Handler) buildImportSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) ImportSecretRaw {
	sec := ps.Secret

	metadata := make([]ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, ResourceMetadata{
			Key:         m.Key,
			Value:       m.Value,
			IsEncrypted: m.IsEncrypted,
		})
	}

	raw := ImportSecretRaw{
		ID:                sec.ID.String(),
		UnderscoreID:      sec.ID.String(),
		Workspace:         projectID,
		Environment:       ps.Environment,
		Version:           int(sec.Version),
		Type:              ImportSecretRawType(sec.Type),
		SecretKey:         sec.Key,
		SecretValue:       ps.Value,
		SecretComment:     ps.Comment,
		SecretValueHidden: ps.ValueHidden,
		SecretMetadata:    metadata,
	}

	if sec.SkipMultilineEncoding.Valid {
		raw.SkipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}
	raw.IsRotatedSecret = new(sec.IsRotatedSecret())
	if sec.IsRotatedSecret() {
		rid := sec.GetRotationID().String()
		raw.RotationID = &rid
	}

	return raw
}

// buildImportsResponse builds the imports array for the API response.
// Only direct imports (depth=0) are returned as entries. Secrets from nested
// imports (depth>0) are merged into their parent direct import's secrets array.
func (h *Handler) buildImportsResponse(
	result *secretsvc.ListSecretsResult,
	projectID string,
) []SecretImport {
	secretsByImport := make(map[string][]secretsvc.ProcessedSecret)
	for i := range result.ImportedSecrets {
		sec := &result.ImportedSecrets[i]
		key := sec.ImportEnvironment + ":" + sec.ImportPath
		secretsByImport[key] = append(secretsByImport[key], *sec)
	}

	imports := make([]SecretImport, 0)
	var currentImport *SecretImport

	for i := range result.Imports {
		imp := &result.Imports[i]
		envSlug, _ := result.FolderLookup.GetEnvSlug(imp.EnvID)
		key := envSlug + ":" + imp.Path
		impSecrets := secretsByImport[key]

		if imp.Depth == 0 {
			// Direct import: create a new entry
			folderID := imp.FolderID.String()
			imports = append(imports, SecretImport{
				SecretPath:  imp.Path,
				Environment: envSlug,
				FolderID:    &folderID,
				Secrets:     make([]ImportSecretRaw, 0, len(impSecrets)),
			})
			currentImport = &imports[len(imports)-1]
		}

		// Add secrets to the current direct import (whether this is depth=0 or nested)
		if currentImport != nil {
			for j := range impSecrets {
				currentImport.Secrets = append(currentImport.Secrets, h.buildImportSecretRaw(&impSecrets[j], projectID))
			}
		}
	}

	return imports
}

// CreateListSecretsAuditLog creates an audit log entry for listing secrets.
// TODO: Re-enable once Go backend is primary - currently disabled to avoid duplicate logs with Node.js
func (h *Handler) CreateListSecretsAuditLog(ctx context.Context, projectID, env, secretPath string, numberOfSecrets int) error {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return errutil.NotFound("Identity not found in context").WithErr(err)
	}

	info := auditlog.BuildAuditLogInfo(identity)
	if info == nil {
		return nil
	}

	dto := &auditlog.CreateAuditLogDTO{
		Event: auditlog.Event{
			Metadata: auditlog.GetSecretsEventMetadata{
				Environment:     env,
				SecretPath:      secretPath,
				NumberOfSecrets: numberOfSecrets,
			},
		},
		Actor:         info.Actor,
		ProjectID:     &projectID,
		IPAddress:     info.IPAddress,
		UserAgent:     info.UserAgent,
		UserAgentType: info.UserAgentType,
	}

	if err := h.auditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf("createGetSecretsAuditLog: %w", err)
	}

	return nil
}

// parseTagSlugs parses a comma-separated string of tag slugs into a slice.
func parseTagSlugs(tagSlugsStr *string) []string {
	if tagSlugsStr == nil || *tagSlugsStr == "" {
		return nil
	}
	parts := strings.Split(*tagSlugsStr, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

// parseMetadataFilter parses a pipe-delimited string of metadata filters.
func parseMetadataFilter(metadataFilterStr *string) []secretsvc.MetadataFilter {
	if metadataFilterStr == nil || *metadataFilterStr == "" {
		return nil
	}

	pairs := strings.Split(*metadataFilterStr, "|")
	result := make([]secretsvc.MetadataFilter, 0, len(pairs))

	for _, pair := range pairs {
		entry := secretsvc.MetadataFilter{}
		parts := strings.SplitSeq(pair, ",")

		for part := range parts {
			kv := strings.SplitN(part, "=", 2)
			if len(kv) != 2 {
				continue
			}
			identifier := strings.TrimSpace(strings.ToLower(kv[0]))
			value := strings.TrimSpace(kv[1])

			switch identifier {
			case "key":
				entry.Key = value
			case "value":
				entry.Value = value
			}
		}

		if entry.Key != "" && entry.Value != "" {
			result = append(result, entry)
		}
	}

	if len(result) == 0 {
		return nil
	}
	return result
}

// getUserID extracts user ID from identity if actor is a user.
func getUserID(identity *auth.Identity) *uuid.UUID {
	if identity == nil {
		return nil
	}
	if identity.Actor == auth.ActorTypeUser {
		return &identity.ActorID
	}
	return nil
}

// getSecretType returns the secret type, defaulting to "shared" and forcing "shared" for non-user actors.
func getSecretType(identity *auth.Identity, requestedType string) string {
	if requestedType == "" {
		return "shared"
	}
	if identity == nil {
		return "shared"
	}
	switch identity.Actor {
	case auth.ActorTypeIdentity, auth.ActorTypeService:
		return "shared"
	default:
		return requestedType
	}
}
