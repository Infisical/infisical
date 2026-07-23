//go:generate go tool oapi-codegen -config cfg.yaml openapi.yaml

package secret

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	secretsvc "github.com/infisical/api/internal/services/secrets/secret"
	"github.com/infisical/api/internal/services/secrets/secretcache"
)

// Compile-time check that Handler implements ServiceInterface.
var _ ServiceInterface = (*Handler)(nil)

// --- Service Interfaces (consumer-defined) ---

// PermissionService provides project permission checks.
type PermissionService interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
	GetPermissionFingerprint(ctx context.Context, args *permission.GetPermissionFingerprintArgs) (string, error)
}

// ProjectService resolves project identifiers.
type ProjectService interface {
	ResolveProjectID(ctx context.Context, orgID uuid.UUID, workspaceID, workspaceSlug *string) (string, error)
}

// AuditLogService creates audit log entries.
type AuditLogService interface {
	CreateAuditLog(ctx context.Context, dto *auditlog.CreateAuditLogDTO) error
}

// SecretsService provides secret management operations.
type SecretsService interface {
	ListSecrets(ctx context.Context, opts *secretsvc.ListSecretsOpts) (*secretsvc.ListSecretsResult, error)
	GetSecretByName(ctx context.Context, opts *secretsvc.GetSecretByNameOpts) (*secretsvc.GetSecretByNameResult, error)
	FetchAbsoluteSecrets(ctx context.Context, refs []secretsvc.AbsoluteSecretRef, opts secretsvc.AbsoluteFetchOpts) []*secretsvc.ProcessedSecret
	LoadProjectImports(ctx context.Context, projectID string) (*secretsvc.ImportLookup, error)
	FindByFolderIds(ctx context.Context, folderIDs []uuid.UUID, userID *uuid.UUID, filters *secretsvc.FindByFolderIdsFilter) ([]secretsvc.Secret, error)
}

// KMSService creates cipher pairs for encryption/decryption.
type KMSService interface {
	CreateCipherPairWithProjectDataKey(ctx context.Context, projectID string) (*kms.CipherPair, error)
}

// SecretCacheService provides caching for secrets operations.
type SecretCacheService interface {
	CheckListSecrets(ctx context.Context, params *secretcache.ListSecretsCacheParams, cipherPair *kms.CipherPair) (*secretcache.ListSecretsCacheResult, error)
	WriteListSecrets(ctx context.Context, params *secretcache.ListSecretsCacheParams, cipherPair *kms.CipherPair, response any) (string, error)
}

// --- Handler ---

// Handler provides HTTP handlers for secrets endpoints.
type Handler struct {
	logger      *slog.Logger
	permission  PermissionService
	project     ProjectService
	auditLog    AuditLogService
	secrets     SecretsService
	kms         KMSService
	secretCache SecretCacheService
}

// Deps holds the dependencies for the secrets handler.
type Deps struct {
	Logger      *slog.Logger
	Permission  PermissionService
	Project     ProjectService
	AuditLog    AuditLogService
	Secrets     SecretsService
	KMS         KMSService
	SecretCache SecretCacheService
}

// NewHandler creates a new secrets handler.
func NewHandler(deps *Deps) *Handler {
	return &Handler{
		logger:      deps.Logger.With(slog.String("handler", "secrets")),
		permission:  deps.Permission,
		project:     deps.Project,
		auditLog:    deps.AuditLog,
		secrets:     deps.Secrets,
		kms:         deps.KMS,
		secretCache: deps.SecretCache,
	}
}

// --- OpenAPI Spec Methods ---

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

	var ifNoneMatch string
	if opts.Header != nil && opts.Header.IfNoneMatch != nil {
		ifNoneMatch = *opts.Header.IfNoneMatch
	}

	result, err := h.listSecrets(ctx, &listSecretsInternalOpts{
		ProjectID:                 q.ProjectID,
		Environment:               q.Environment,
		SecretPath:                fn.RemoveTrailingSlash(fn.ValueOr(q.SecretPath, "/")),
		UserID:                    getUserID(identity),
		Recursive:                 fn.ValueOr(q.Recursive, false),
		ViewSecretValue:           fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences:    fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:            fn.ValueOr(q.IncludeImports, true),
		PersonalOverridesBehavior: behavior,
		TagSlugs:                  parseTagSlugs(q.TagSlugs),
		MetadataFilter:            parseMetadataFilter(q.MetadataFilter),
		IfNoneMatch:               ifNoneMatch,
	})
	if err != nil {
		return nil, err
	}

	if result.NotModified {
		resp := NewListSecretsV4ResponseData(&ListSecretsV4Response{
			Secrets: []SecretRaw{},
		})
		resp.Headers = make(http.Header)
		resp.Headers.Set("ETag", result.ETag)
		return resp.WithStatus(http.StatusNotModified), nil
	}

	resp := NewListSecretsV4ResponseData(&ListSecretsV4Response{
		Secrets: result.Response.Secrets,
		Imports: result.Response.Imports,
	})
	if result.ETag != "" {
		resp.Headers = make(http.Header)
		resp.Headers.Set("ETag", result.ETag)
	}
	return resp, nil
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

	var ifNoneMatch string
	if opts.Header != nil && opts.Header.IfNoneMatch != nil {
		ifNoneMatch = *opts.Header.IfNoneMatch
	}

	result, err := h.listSecrets(ctx, &listSecretsInternalOpts{
		ProjectID:                 projectID,
		Environment:               env,
		SecretPath:                fn.RemoveTrailingSlash(fn.ValueOr(q.SecretPath, "/")),
		UserID:                    getUserID(identity),
		Recursive:                 fn.ValueOr(q.Recursive, false),
		ViewSecretValue:           fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences:    fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:            fn.ValueOr(q.IncludeImports, false),
		PersonalOverridesBehavior: PersonalOverridesIncludeAll,
		TagSlugs:                  parseTagSlugs(q.TagSlugs),
		MetadataFilter:            parseMetadataFilter(q.MetadataFilter),
		IfNoneMatch:               ifNoneMatch,
	})
	if err != nil {
		return nil, err
	}

	if result.NotModified {
		resp := NewListSecretsRawV3ResponseData(&ListSecretsRawV3Response{
			Secrets: []SecretRaw{},
		})
		resp.Headers = make(http.Header)
		resp.Headers.Set("ETag", result.ETag)
		return resp.WithStatus(http.StatusNotModified), nil
	}

	resp := NewListSecretsRawV3ResponseData(&ListSecretsRawV3Response{
		Secrets: result.Response.Secrets,
		Imports: result.Response.Imports,
	})
	if result.ETag != "" {
		resp.Headers = make(http.Header)
		resp.Headers.Set("ETag", result.ETag)
	}
	return resp, nil
}

// GetSecretByNameV4 is the handler for getting a secret by name (V4).
func (h *Handler) GetSecretByNameV4(ctx context.Context, opts *GetSecretByNameV4ServiceRequestOptions) (*GetSecretByNameV4ResponseData, error) {
	q := opts.Query
	p := opts.PathParams

	h.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("projectId", q.ProjectID),
		slog.String("environment", q.Environment),
		slog.String("secretPath", fn.ValueOr(q.SecretPath, "/")),
		slog.String("secretName", p.SecretName),
	)

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	secretType := "shared"
	if q.Type != nil {
		secretType = string(*q.Type)
	}

	response, err := h.getSecretByName(ctx, &getSecretByNameInternalOpts{
		ProjectID:              q.ProjectID,
		Environment:            q.Environment,
		SecretPath:             fn.RemoveTrailingSlash(fn.ValueOr(q.SecretPath, "/")),
		SecretName:             p.SecretName,
		SecretType:             getSecretType(identity, secretType),
		UserID:                 getUserID(identity),
		ViewSecretValue:        fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences: fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:         fn.ValueOr(q.IncludeImports, true),
		Version:                q.Version,
	})
	if err != nil {
		return nil, err
	}

	return NewGetSecretByNameV4ResponseData(&GetSecretByNameV4Response{
		Secret: response.Secret,
	}), nil
}

// GetSecretByNameRawV3 is the handler for getting a raw secret by name (V3, deprecated).
func (h *Handler) GetSecretByNameRawV3(ctx context.Context, opts *GetSecretByNameRawV3ServiceRequestOptions) (*GetSecretByNameRawV3ResponseData, error) {
	q := opts.Query
	p := opts.PathParams

	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return nil, err
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, q.WorkspaceID, q.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", projectID),
		slog.String("environment", fn.ValueOr(q.Environment, "")),
	)

	env := fn.ValueOr(q.Environment, "")
	if env == "" {
		return nil, errutil.BadRequest("Environment is required")
	}

	secretType := "shared"
	if q.Type != nil {
		secretType = string(*q.Type)
	}

	response, err := h.getSecretByName(ctx, &getSecretByNameInternalOpts{
		ProjectID:              projectID,
		Environment:            env,
		SecretPath:             fn.RemoveTrailingSlash(fn.ValueOr(q.SecretPath, "/")),
		SecretName:             p.SecretName,
		SecretType:             getSecretType(identity, secretType),
		UserID:                 getUserID(identity),
		ViewSecretValue:        fn.ValueOr(q.ViewSecretValue, true),
		ExpandSecretReferences: fn.ValueOr(q.ExpandSecretReferences, true),
		IncludeImports:         fn.ValueOr(q.IncludeImports, false),
		Version:                q.Version,
	})
	if err != nil {
		return nil, err
	}

	return NewGetSecretByNameRawV3ResponseData(&GetSecretByNameRawV3Response{
		Secret: response.Secret,
	}), nil
}
