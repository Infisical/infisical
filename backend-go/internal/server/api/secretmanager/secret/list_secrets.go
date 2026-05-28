package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	permsecretsvc "github.com/infisical/api/internal/services/permission/secretmanager"
	secretsvc "github.com/infisical/api/internal/services/secretmanager/secret"
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
}

// listSecretsResponse is the internal response type for listing secrets.
type listSecretsResponse struct {
	Secrets []SecretRaw
	Imports []SecretImport
}

// listSecrets is the unified internal method for listing secrets.
// Both V3 and V4 handlers call this with different options.
func (h *Handler) listSecrets(ctx context.Context, opts *listSecretsInternalOpts) (*listSecretsResponse, error) {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	// 1. Get permission
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

	// 2. Fetch ALL secrets (permission-agnostic)
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

	// 3. Expand references (on full pool, before filtering)
	if opts.ExpandSecretReferences {
		allSecrets := result.AllSecrets()
		expander := secretsvc.NewSecretExpander(allSecrets, secretsvc.ExpandOpts{
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

	// 4. Filter by permission + apply ValueHidden
	result.DirectSecrets = filterListSecretsByPermission(result.DirectSecrets, checker, opts)
	result.ImportedSecrets = filterListSecretsByPermission(result.ImportedSecrets, checker, opts)

	// 5. Filter personal overrides
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
			return filtered
		default:
			return secrets
		}
	}
	result.DirectSecrets = filterPersonalOverrides(result.DirectSecrets)
	result.ImportedSecrets = filterPersonalOverrides(result.ImportedSecrets)

	// 6. Build response
	response := h.buildListSecretsResponse(result, opts.ProjectID, opts.IncludeImports)

	// 7. Audit log
	if err := h.createGetSecretsAuditLog(ctx, opts.ProjectID, opts.Environment, opts.SecretPath, len(response.Secrets)); err != nil {
		return nil, err
	}

	return response, nil
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

// ListSecretsV4 is the handler for listing secrets (V4).
func (h *Handler) ListSecretsV4(ctx context.Context, opts *ListSecretsV4ServiceRequestOptions) (*ListSecretsV4ResponseData, error) {
	q := opts.Query

	h.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", q.ProjectID),
		slog.String("environment", q.Environment),
		slog.String("secretPath", fn.ValueOr(q.SecretPath, "/")),
	)

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	behavior := PersonalOverridesNeverInclude
	if fn.ValueOr(q.IncludePersonalOverrides, false) {
		behavior = PersonalOverridesPriority
	}

	response, err := h.listSecrets(ctx, &listSecretsInternalOpts{
		ProjectID:                 q.ProjectID,
		Environment:               q.Environment,
		SecretPath:                fn.ValueOr(q.SecretPath, "/"),
		UserID:                    getUserID(identity),
		Recursive:                 fn.ValueOr(q.Recursive, false),
		ViewSecretValue:           fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences:    fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:            fn.ValueOr(q.IncludeImports, true),
		PersonalOverridesBehavior: behavior,
		TagSlugs:                  parseTagSlugs(q.TagSlugs),
		MetadataFilter:            parseMetadataFilter(q.MetadataFilter),
	})
	if err != nil {
		return nil, err
	}

	return NewListSecretsV4ResponseData(&ListSecretsV4Response{
		Secrets: response.Secrets,
		Imports: response.Imports,
	}), nil
}

// ListSecretsRawV3 is the handler for listing raw secrets (V3, deprecated).
func (h *Handler) ListSecretsRawV3(ctx context.Context, opts *ListSecretsRawV3ServiceRequestOptions) (*ListSecretsRawV3ResponseData, error) {
	q := opts.Query

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, q.WorkspaceID, q.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "listing secrets raw v3",
		slog.String("projectId", projectID),
		slog.String("environment", fn.ValueOr(q.Environment, "")),
		slog.String("secretPath", fn.ValueOr(q.SecretPath, "/")),
	)

	env := fn.ValueOr(q.Environment, "")
	if env == "" {
		return nil, errutil.BadRequest("Environment is required")
	}

	response, err := h.listSecrets(ctx, &listSecretsInternalOpts{
		ProjectID:                 projectID,
		Environment:               env,
		SecretPath:                fn.ValueOr(q.SecretPath, "/"),
		UserID:                    getUserID(identity),
		Recursive:                 fn.ValueOr(q.Recursive, false),
		ViewSecretValue:           fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences:    fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:            fn.ValueOr(q.IncludeImports, true),
		PersonalOverridesBehavior: PersonalOverridesIncludeAll, // V3 default
		TagSlugs:                  parseTagSlugs(q.TagSlugs),
		MetadataFilter:            parseMetadataFilter(q.MetadataFilter),
	})
	if err != nil {
		return nil, err
	}

	return NewListSecretsRawV3ResponseData(&ListSecretsRawV3Response{
		Secrets: response.Secrets,
		Imports: response.Imports,
	}), nil
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
		if tag.Color != "" {
			t.Color = &tag.Color
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
		CreatedAt:             sec.CreatedAt.Format("2006-01-02T15:04:05.000Z"),
		UpdatedAt:             sec.UpdatedAt.Format("2006-01-02T15:04:05.000Z"),
		SecretValueHidden:     ps.ValueHidden,
		Tags:                  tags,
		SecretMetadata:        metadata,
		SkipMultilineEncoding: skipMultilineEncoding,
		IsRotatedSecret:       &isRotated,
		RotationID:            rotationID,
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

	isRotated := sec.IsRotatedSecret()

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
		IsRotatedSecret:   &isRotated,
	}

	if sec.SkipMultilineEncoding.Valid {
		raw.SkipMultilineEncoding = &sec.SkipMultilineEncoding.V
	}
	if isRotated {
		rid := sec.GetRotationID().String()
		raw.RotationID = &rid
	}

	return raw
}

// buildImportsResponse builds the imports array for the API response.
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

	imports := make([]SecretImport, 0, len(result.Imports))
	for i := range result.Imports {
		imp := &result.Imports[i]
		envSlug, _ := result.FolderLookup.GetEnvSlug(imp.EnvID)
		key := envSlug + ":" + imp.Path
		impSecrets := secretsByImport[key]

		importSecrets := make([]ImportSecretRaw, 0, len(impSecrets))
		for j := range impSecrets {
			importSecrets = append(importSecrets, h.buildImportSecretRaw(&impSecrets[j], projectID))
		}

		folderID := imp.FolderID.String()
		imports = append(imports, SecretImport{
			SecretPath:  imp.Path,
			Environment: envSlug,
			FolderID:    &folderID,
			Secrets:     importSecrets,
		})
	}

	return imports
}
