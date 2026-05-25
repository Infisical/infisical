package secret

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	permsecretsvc "github.com/infisical/api/internal/services/permission/secretmanager"
	secretsvc "github.com/infisical/api/internal/services/secretmanager/secret"
)

// ListSecretsV4 is the handler for listing secrets (V4).
func (h *Handler) ListSecretsV4(ctx context.Context, req *ListSecretsV4Request) (ListSecretsV4Response, error) {
	h.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", req.ProjectID),
		slog.String("environment", req.Environment),
		slog.String("secretPath", req.SecretPath),
	)

	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return ListSecretsV4Response{}, errutil.Unauthorized("Authentication required")
	}

	permResult, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ProjectID:         req.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return ListSecretsV4Response{}, err
	}

	behavior := secretsvc.PersonalOverridesNeverInclude
	if req.IncludePersonalOverrides {
		behavior = secretsvc.PersonalOverridesPriority
	}

	result, err := h.secrets.ListSecrets(ctx, &secretsvc.ListSecretsOpts{
		ProjectID:                 req.ProjectID,
		Environment:               req.Environment,
		SecretPath:                req.SecretPath,
		UserID:                    getUserID(identity),
		ViewSecretValue:           req.ViewSecretValue,
		ExpandSecretReferences:    req.ExpandSecretReferences,
		Recursive:                 req.Recursive,
		PersonalOverridesBehavior: behavior,
		ExpandPersonalOverrides:   req.IncludePersonalOverrides,
		TagSlugs:                  parseTagSlugs(&req.TagSlugs),
		MetadataFilter:            parseMetadataFilter(&req.MetadataFilter),
		Access:                    secretsvc.AccessControl{Checker: permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)},
	})
	if err != nil {
		return ListSecretsV4Response{}, err
	}

	response := h.buildListSecretsResponse(result, req.ProjectID, req.IncludeImports)

	if err := h.createGetSecretsAuditLog(ctx, req.ProjectID, req.Environment, req.SecretPath, len(response.Secrets)); err != nil {
		return ListSecretsV4Response{}, err
	}

	return response, nil
}

// buildListSecretsResponse builds the response for ListSecretsV4.
func (h *Handler) buildListSecretsResponse(
	result *secretsvc.ListSecretsResult,
	projectID string,
	includeImports bool,
) ListSecretsV4Response {
	secretsResponse := make([]*SecretRaw, 0, len(result.DirectSecrets))
	for i := range result.DirectSecrets {
		secretsResponse = append(secretsResponse, h.buildSecretRaw(&result.DirectSecrets[i], projectID))
	}

	var importsResponse []*SecretImport
	if includeImports {
		importsResponse = h.buildImportsResponse(result, projectID)
	}

	return ListSecretsV4Response{
		Secrets: secretsResponse,
		Imports: importsResponse,
	}
}

// ListSecretsRawV3 is the handler for listing raw secrets (V3, deprecated).
func (h *Handler) ListSecretsRawV3(ctx context.Context, req *ListSecretsRawV3Request) (ListSecretsV4Response, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return ListSecretsV4Response{}, errutil.Unauthorized("Authentication required")
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, req.WorkspaceID, req.WorkspaceSlug)
	if err != nil {
		return ListSecretsV4Response{}, err
	}

	h.logger.InfoContext(ctx, "listing secrets raw v3",
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(req.Environment)),
		slog.String("secretPath", req.SecretPath),
	)

	if req.Environment == nil || *req.Environment == "" {
		return ListSecretsV4Response{}, errutil.BadRequest("Environment is required")
	}

	permResult, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ProjectID:         projectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return ListSecretsV4Response{}, err
	}

	result, err := h.secrets.ListSecrets(ctx, &secretsvc.ListSecretsOpts{
		ProjectID:                 projectID,
		Environment:               *req.Environment,
		SecretPath:                req.SecretPath,
		UserID:                    getUserID(identity),
		ViewSecretValue:           req.ViewSecretValue,
		ExpandSecretReferences:    req.ExpandSecretReferences,
		Recursive:                 req.Recursive,
		PersonalOverridesBehavior: secretsvc.PersonalOverridesIncludeAll,
		TagSlugs:                  parseTagSlugs(req.TagSlugs),
		MetadataFilter:            parseMetadataFilter(req.MetadataFilter),
		Access:                    secretsvc.AccessControl{Checker: permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)},
	})
	if err != nil {
		return ListSecretsV4Response{}, err
	}

	response := h.buildListSecretsResponse(result, projectID, req.IncludeImports)

	if err := h.createGetSecretsAuditLog(ctx, projectID, *req.Environment, req.SecretPath, len(response.Secrets)); err != nil {
		return ListSecretsV4Response{}, err
	}

	return response, nil
}

// buildSecretRaw converts a ProcessedSecret to the API response type.
func (h *Handler) buildSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) *SecretRaw {
	sec := ps.Secret

	tags := make([]*SecretTag, 0, len(sec.Tags))
	for _, tag := range sec.Tags {
		tags = append(tags, &SecretTag{
			ID:   tag.ID.String(),
			Slug: tag.Slug,
		})
	}

	metadata := make([]*ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, &ResourceMetadata{
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

	secretPath := ps.SecretPath
	return &SecretRaw{
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

// buildImportSecretRaw converts a ProcessedSecret to the import API response type.
func (h *Handler) buildImportSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) *ImportSecretRaw {
	sec := ps.Secret

	metadata := make([]*ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, &ResourceMetadata{
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

	return &ImportSecretRaw{
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

// buildImportsResponse builds the imports array for the API response.
func (h *Handler) buildImportsResponse(
	result *secretsvc.ListSecretsResult,
	projectID string,
) []*SecretImport {
	secretsByImport := make(map[string][]secretsvc.ProcessedSecret)
	for i := range result.ImportedSecrets {
		sec := &result.ImportedSecrets[i]
		key := sec.ImportEnvironment + ":" + sec.ImportPath
		secretsByImport[key] = append(secretsByImport[key], *sec)
	}

	imports := make([]*SecretImport, 0, len(result.Imports))
	for i := range result.Imports {
		imp := &result.Imports[i]
		envSlug, _ := result.FolderLookup.GetEnvSlug(imp.EnvID)
		key := envSlug + ":" + imp.Path
		impSecrets := secretsByImport[key]

		importSecrets := make([]*ImportSecretRaw, 0, len(impSecrets))
		for j := range impSecrets {
			importSecrets = append(importSecrets, h.buildImportSecretRaw(&impSecrets[j], projectID))
		}

		folderID := imp.FolderID.String()
		imports = append(imports, &SecretImport{
			SecretPath:  imp.Path,
			Environment: envSlug,
			FolderID:    &folderID,
			Secrets:     importSecrets,
		})
	}

	return imports
}
