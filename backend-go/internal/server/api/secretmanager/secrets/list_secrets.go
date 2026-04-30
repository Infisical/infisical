package secrets

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	secretsexpansion "github.com/infisical/api/internal/services/secretmanager/secrets"
)

// MetadataFilterEntry represents a single key-value filter for metadata.
type MetadataFilterEntry struct {
	Key   string
	Value string
}

// ListSecretsOpts contains the common options for listing secrets.
type ListSecretsOpts struct {
	ProjectID                 string
	Environment               string
	SecretPath                string
	ViewSecretValue           bool
	ExpandSecretReferences    bool
	Recursive                 bool
	IncludeImports            bool
	PersonalOverridesBehavior PersonalOverridesBehavior
	ExpandPersonalOverrides   bool // Whether to include personal overrides during expansion
	TagSlugs                  []string
	MetadataFilter            []MetadataFilterEntry
}

// parseTagSlugs parses a comma-separated string of tag slugs into a slice.
// Returns nil if the input is empty.
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
// Format: "key=k1,value=v1|key=k2,value=v2"
// Returns nil if the input is empty or invalid.
func parseMetadataFilter(metadataFilterStr *string) []MetadataFilterEntry {
	if metadataFilterStr == nil || *metadataFilterStr == "" {
		return nil
	}

	pairs := strings.Split(*metadataFilterStr, "|")
	result := make([]MetadataFilterEntry, 0, len(pairs))

	for _, pair := range pairs {
		entry := MetadataFilterEntry{}
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

		// Only add if both key and value are present
		if entry.Key != "" && entry.Value != "" {
			result = append(result, entry)
		}
	}

	if len(result) == 0 {
		return nil
	}
	return result
}

// listSecretsCore is the shared implementation for v3 and v4 list secrets endpoints.
func (h *Handler) listSecretsCore(ctx context.Context, opts *ListSecretsOpts) (*gensecrets.ListSecretsResult, error) {
	// 1. Get identity from context
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required").WithErrf("listSecretsCore: identity not in context")
	}

	actorID := identity.ActorID
	orgID := identity.OrgID

	// TODO(go): Permission fingerprint for ETag caching

	// 2. Get project permission
	permResult, err := h.sharedSvc.Permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           actorID,
		ProjectID:         opts.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        orgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get project permission").WithErrf("ListSecrets(projectId=%s): %w", opts.ProjectID, err)
	}

	// 3. Load all environments for the project (metadata only, for envID -> slug mapping)
	allEnvs, err := h.secretManagerSvc.EnvironmentDAL.GetAllByProjectID(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("ListSecrets(projectId=%s): %w", opts.ProjectID, err)
	}

	// Build environment lookups and find requested env
	envByID := make(map[uuid.UUID]secretimport.EnvironmentInfo, len(allEnvs))
	envBySlug := make(map[string]uuid.UUID, len(allEnvs))
	var env *environment.Environment
	for i := range allEnvs {
		envByID[allEnvs[i].ID] = secretimport.EnvironmentInfo{
			ID:   allEnvs[i].ID,
			Slug: allEnvs[i].Slug,
		}
		envBySlug[allEnvs[i].Slug] = allEnvs[i].ID
		if allEnvs[i].Slug == opts.Environment {
			env = &allEnvs[i]
		}
	}
	if env == nil {
		return nil, errutil.NotFound("Environment not found").WithErrf("ListSecrets: environment '%s' not found in project", opts.Environment)
	}

	// 4. Load imports for the project
	importLookup, err := h.secretManagerSvc.SecretImport.LoadProjectImports(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("ListSecrets(projectId=%s): %w", opts.ProjectID, err)
	}

	// 5. Resolve direct folders + import chain
	chainResolver := secretimport.NewChainResolver(importLookup, h.secretManagerSvc.SecretFolder)
	chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, opts.Recursive, envByID)
	if err != nil {
		return nil, errutil.NotFound("Folder not found").WithErrf("ListSecrets(path=%s): %w", opts.SecretPath, err)
	}

	// 6. Prepare user ID for personal secrets
	var userID *uuid.UUID
	if identity.Actor == permission.ActorTypeUser {
		userID = &actorID
	}

	// 7. Fetch secrets from all folders (direct + imported)
	allFolderIDs := chainResult.AllFolderIDs()

	// Build filters for tagSlugs and metadataFilter
	var dalFilters *secret.FindByFolderIdsFilter
	if len(opts.TagSlugs) > 0 || len(opts.MetadataFilter) > 0 {
		dalFilters = &secret.FindByFolderIdsFilter{}
		if len(opts.TagSlugs) > 0 {
			dalFilters.TagSlugs = opts.TagSlugs
		}
		if len(opts.MetadataFilter) > 0 {
			dalFilters.MetadataFilter = make([]secret.MetadataFilter, len(opts.MetadataFilter))
			for i, mf := range opts.MetadataFilter {
				dalFilters.MetadataFilter[i] = secret.MetadataFilter{
					Key:   mf.Key,
					Value: mf.Value,
				}
			}
		}
	}

	secrets, err := h.secretManagerSvc.SecretDAL.FindByFolderIds(ctx, allFolderIDs, userID, dalFilters)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to fetch secrets").WithErrf("ListSecrets(projectId=%s): %w", opts.ProjectID, err)
	}

	// 8. Get KMS cipher pair for decryption
	cipherPair, err := h.sharedSvc.KMS.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("ListSecrets(projectId=%s): %w", opts.ProjectID, err)
	}

	// 9. Process secrets with permission filtering
	directSecrets, importedSecrets := processSecretsWithPermissions(
		secrets,
		chainResult.DirectFolderIDs,
		chainResult.DirectPaths,
		chainResult.Imports,
		opts.Environment,
		secretProcessorOpts{
			ViewSecretValue: opts.ViewSecretValue,
			Ability:         permResult.Permission.Ability,
			CipherPair:      cipherPair,
			RequestedPath:   opts.SecretPath,
			Recursive:       opts.Recursive,
		},
	)

	// 10. Apply personal overrides behavior filtering
	directSecrets = filterByPersonalOverridesBehavior(directSecrets, opts.PersonalOverridesBehavior)
	importedSecrets = filterByPersonalOverridesBehavior(importedSecrets, opts.PersonalOverridesBehavior)

	// 11. Expand secret references if requested
	if opts.ExpandSecretReferences {
		inputs := buildSecretInputsForExpansion(directSecrets, importedSecrets, chainResult.Imports)

		// Only pass userID to expansion when expandPersonalOverrides is true AND
		// personal behavior is Priority or IncludeAll (matching Node.js behavior)
		var expansionUserID *uuid.UUID
		if opts.ExpandPersonalOverrides &&
			(opts.PersonalOverridesBehavior == PersonalOverridesPriority ||
				opts.PersonalOverridesBehavior == PersonalOverridesIncludeAll) {
			expansionUserID = userID
		}

		absoluteFetcher := newAbsoluteSecretFetcher(
			ctx,
			opts.ProjectID,
			envBySlug,
			chainResult.FolderLookup,
			h.secretManagerSvc.SecretFolder,
			h.secretManagerSvc.SecretDAL,
			cipherPair,
			expansionUserID,
		)

		expander := secretsexpansion.NewSecretExpander(inputs, secretsexpansion.ExpandOpts{
			CanAccessAbsolute: func(ref secretsexpansion.AbsoluteSecretRef) bool {
				return permission.CanReadSecretValue(permResult.Permission.Ability, ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: absoluteFetcher.Fetch,
		})
		expander.Expand()

		// Check for permission-denied references and return error (matching Node.js behavior)
		if expander.HasDeniedRefs() {
			deniedRefs := expander.DeniedRefs()
			details := make([]string, len(deniedRefs))
			for i, ref := range deniedRefs {
				details[i] = "Permission denied for secret reference: " + ref
			}
			return nil, errutil.Forbidden("Failed to expand one or more secret references").
				WithErrf("listSecretsCore: denied refs: %v", deniedRefs)
		}

		applyExpandedValues(directSecrets, importedSecrets, expander)
	}

	// 12. Build response
	result := make([]*gensecrets.SecretRaw, 0, len(directSecrets))
	for i := range directSecrets {
		result = append(result, h.buildSecretRaw(&directSecrets[i], opts.ProjectID, cipherPair))
	}

	var importsResult []*gensecrets.SecretImport
	if opts.IncludeImports {
		importsResult = h.buildImportsResponse(importedSecrets, chainResult.Imports, opts.ProjectID, cipherPair)
	}

	// TODO(go): ETag caching

	return &gensecrets.ListSecretsResult{
		Secrets: result,
		Imports: importsResult,
	}, nil
}

func (h *Handler) ListSecretsV4(ctx context.Context, p *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	h.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
		slog.String("secretPath", p.SecretPath),
	)

	// v4: NeverInclude by default, Priority when includePersonalOverrides=true
	behavior := PersonalOverridesNeverInclude
	if p.IncludePersonalOverrides {
		behavior = PersonalOverridesPriority
	}

	result, err := h.listSecretsCore(ctx, &ListSecretsOpts{
		ProjectID:                 p.ProjectID,
		Environment:               p.Environment,
		SecretPath:                p.SecretPath,
		ViewSecretValue:           p.ViewSecretValue,
		ExpandSecretReferences:    p.ExpandSecretReferences,
		Recursive:                 p.Recursive,
		IncludeImports:            p.IncludeImports,
		PersonalOverridesBehavior: behavior,
		ExpandPersonalOverrides:   p.IncludePersonalOverrides,
		TagSlugs:                  parseTagSlugs(p.TagSlugs),
		MetadataFilter:            parseMetadataFilter(p.MetadataFilter),
	})
	if err != nil {
		return nil, err
	}

	if err := h.createGetSecretsAuditLog(ctx, p.ProjectID, p.Environment, p.SecretPath, len(result.Secrets)); err != nil {
		return nil, err
	}

	return result, nil
}

func (h *Handler) ListSecretsV3(ctx context.Context, p *gensecrets.ListSecretsV3Payload) (*gensecrets.ListSecretsResult, error) {
	h.logger.InfoContext(ctx, "listing secrets v3",
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
		slog.String("secretPath", p.SecretPath),
	)

	// v3: Always include all (both shared and personal)
	result, err := h.listSecretsCore(ctx, &ListSecretsOpts{
		ProjectID:                 p.ProjectID,
		Environment:               p.Environment,
		SecretPath:                p.SecretPath,
		ViewSecretValue:           p.ViewSecretValue,
		ExpandSecretReferences:    p.ExpandSecretReferences,
		Recursive:                 p.Recursive,
		IncludeImports:            p.IncludeImports,
		PersonalOverridesBehavior: PersonalOverridesIncludeAll,
		TagSlugs:                  parseTagSlugs(p.TagSlugs),
		MetadataFilter:            parseMetadataFilter(p.MetadataFilter),
	})
	if err != nil {
		return nil, err
	}

	if err := h.createGetSecretsAuditLog(ctx, p.ProjectID, p.Environment, p.SecretPath, len(result.Secrets)); err != nil {
		return nil, err
	}

	return result, nil
}

func (h *Handler) ListSecretsRawV3(ctx context.Context, p *gensecrets.ListSecretsRawV3Payload) (*gensecrets.ListSecretsResult, error) {
	// Resolve project ID from workspaceId or workspaceSlug
	projectID, err := h.resolveProjectID(ctx, p.WorkspaceID, p.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "listing secrets raw v3",
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(p.Environment)),
		slog.String("secretPath", p.SecretPath),
	)

	// Environment is required for this endpoint
	if p.Environment == nil || *p.Environment == "" {
		return nil, errutil.BadRequest("Environment is required").WithErrf("ListSecretsRawV3: environment param missing")
	}

	// v3 raw: Always include all (both shared and personal)
	result, err := h.listSecretsCore(ctx, &ListSecretsOpts{
		ProjectID:                 projectID,
		Environment:               *p.Environment,
		SecretPath:                p.SecretPath,
		ViewSecretValue:           p.ViewSecretValue,
		ExpandSecretReferences:    p.ExpandSecretReferences,
		Recursive:                 p.Recursive,
		IncludeImports:            p.IncludeImports,
		PersonalOverridesBehavior: PersonalOverridesIncludeAll,
		TagSlugs:                  parseTagSlugs(p.TagSlugs),
		MetadataFilter:            parseMetadataFilter(p.MetadataFilter),
	})
	if err != nil {
		return nil, err
	}

	if err := h.createGetSecretsAuditLog(ctx, projectID, *p.Environment, p.SecretPath, len(result.Secrets)); err != nil {
		return nil, err
	}

	return result, nil
}

// buildSecretRaw converts a processedSecret to the API response type.
func (h *Handler) buildSecretRaw(ps *processedSecret, projectID string, cipherPair *kms.CipherPair) *gensecrets.SecretRaw {
	sec := ps.Secret

	tags := make([]*gensecrets.SecretTag, 0, len(sec.Tags))
	for _, tag := range sec.Tags {
		tags = append(tags, &gensecrets.SecretTag{
			ID:   tag.ID.String(),
			Slug: tag.Slug,
		})
	}

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(sec.SecretMetadata))
	for _, m := range sec.SecretMetadata {
		value := m.Value
		isEncrypted := len(m.EncryptedValue) > 0
		if isEncrypted {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err == nil {
				value = string(decrypted)
			}
		}
		metadata = append(metadata, &gensecrets.ResourceMetadata{
			Key:         m.Key,
			Value:       value,
			IsEncrypted: isEncrypted,
		})
	}

	isRotated := sec.IsRotatedSecret()
	var rotationID *string
	if isRotated {
		rid := sec.GetRotationID().String()
		rotationID = &rid
	}

	var skipMultilineEncoding *bool
	if sec.SkipMultilineEncoding.Valid {
		skipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}

	secretPath := ps.SecretPath
	return &gensecrets.SecretRaw{
		ID:                    sec.ID.String(),
		LegacyID:              sec.ID.String(),
		Workspace:             projectID,
		Environment:           ps.Environment,
		Version:               int(sec.Version),
		Type:                  sec.Type,
		SecretKey:             sec.Key,
		SecretValue:           ps.Value,
		SecretComment:         ps.Comment,
		SecretPath:            &secretPath,
		CreatedAt:             sec.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:             sec.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
		SecretValueHidden:     ps.ValueHidden,
		SkipMultilineEncoding: skipMultilineEncoding,
		Tags:                  tags,
		SecretMetadata:        metadata,
		IsRotatedSecret:       &isRotated,
		RotationID:            rotationID,
	}
}

// buildImportsResponse builds the imports array for the API response.
func (h *Handler) buildImportsResponse(
	importedSecrets []processedSecret,
	imports []secretimport.ResolvedImport,
	projectID string,
	cipherPair *kms.CipherPair,
) []*gensecrets.SecretImport {
	secretsByImport := make(map[string][]processedSecret)
	for i := range importedSecrets {
		sec := &importedSecrets[i]
		key := sec.ImportEnvironment + ":" + sec.ImportPath
		secretsByImport[key] = append(secretsByImport[key], *sec)
	}

	result := make([]*gensecrets.SecretImport, 0, len(imports))
	for i := range imports {
		imp := &imports[i]
		key := imp.EnvSlug + ":" + imp.Path
		secrets := secretsByImport[key]

		importSecrets := make([]*gensecrets.ImportSecretRaw, 0, len(secrets))
		for j := range secrets {
			importSecrets = append(importSecrets, h.buildImportSecretRaw(&secrets[j], projectID, cipherPair))
		}

		folderID := imp.FolderID.String()
		result = append(result, &gensecrets.SecretImport{
			SecretPath:  imp.Path,
			Environment: imp.EnvSlug,
			FolderID:    &folderID,
			Secrets:     importSecrets,
		})
	}

	return result
}

// buildImportSecretRaw converts a processedSecret to the import API response type.
func (h *Handler) buildImportSecretRaw(ps *processedSecret, projectID string, cipherPair *kms.CipherPair) *gensecrets.ImportSecretRaw {
	sec := ps.Secret

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(sec.SecretMetadata))
	for _, m := range sec.SecretMetadata {
		value := m.Value
		isEncrypted := len(m.EncryptedValue) > 0
		if isEncrypted {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err == nil {
				value = string(decrypted)
			}
		}
		metadata = append(metadata, &gensecrets.ResourceMetadata{
			Key:         m.Key,
			Value:       value,
			IsEncrypted: isEncrypted,
		})
	}

	isRotated := sec.IsRotatedSecret()
	var rotationID *string
	if isRotated {
		rid := sec.GetRotationID().String()
		rotationID = &rid
	}

	var skipMultilineEncoding *bool
	if sec.SkipMultilineEncoding.Valid {
		skipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}

	return &gensecrets.ImportSecretRaw{
		ID:                    sec.ID.String(),
		LegacyID:              sec.ID.String(),
		Workspace:             projectID,
		Environment:           ps.Environment,
		Version:               int(sec.Version),
		Type:                  sec.Type,
		SecretKey:             sec.Key,
		SecretValue:           ps.Value,
		SecretComment:         ps.Comment,
		SecretValueHidden:     ps.ValueHidden,
		SkipMultilineEncoding: skipMultilineEncoding,
		SecretMetadata:        metadata,
		IsRotatedSecret:       &isRotated,
		RotationID:            rotationID,
	}
}

func (h *Handler) createGetSecretsAuditLog(ctx context.Context, projectID, env, secretPath string, numberOfSecrets int) error {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil
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

	if err := h.sharedSvc.AuditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf("createGetSecretsAuditLog(project=%s, env=%s, path=%s): %w", projectID, env, secretPath, err)
	}

	return nil
}
