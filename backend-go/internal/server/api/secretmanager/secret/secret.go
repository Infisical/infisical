package secret

import (
	"context"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	secretsvc "github.com/infisical/api/internal/services/secretmanager/secret"
)

// --- Service Interfaces (consumer-defined) ---

// PermissionService provides project permission checks.
type PermissionService interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
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
}

// --- Handler ---

// Handler implements the Goa secrets service interface.
type Handler struct {
	auth.Authenticator
	logger     *slog.Logger
	permission PermissionService
	project    ProjectService
	auditLog   AuditLogService
	secrets    SecretsService
}

// Deps holds the dependencies for the secrets handler.
type Deps struct {
	Logger        *slog.Logger
	Authenticator auth.Authenticator
	Permission    PermissionService
	Project       ProjectService
	AuditLog      AuditLogService
	Secrets       SecretsService
}

// NewHandler creates a new secrets handler.
func NewHandler(deps *Deps) *Handler {
	return &Handler{
		Authenticator: deps.Authenticator,
		logger:        deps.Logger.With(slog.String("handler", "secrets")),
		permission:    deps.Permission,
		project:       deps.Project,
		auditLog:      deps.AuditLog,
		secrets:       deps.Secrets,
	}
}

// accessChecker implements secretsvc.AccessChecker using permission service.
type accessChecker struct {
	ability *gocasl.Ability
}

func (a *accessChecker) CanDescribeSecret(env, path, key string, tagSlugs []string) bool {
	return permission.CanDescribeSecret(a.ability, env, path, key, tagSlugs)
}

func (a *accessChecker) CanReadSecretValue(env, path, key string, tagSlugs []string) bool {
	return permission.CanReadSecretValue(a.ability, env, path, key, tagSlugs)
}

// buildAccessChecker creates an AccessChecker from permission result.
func buildAccessChecker(permResult *permission.GetProjectPermissionResult) secretsvc.AccessChecker {
	return &accessChecker{ability: permResult.Permission.Ability}
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

// buildSecretRaw converts a ProcessedSecret to the API response type.
func (h *Handler) buildSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) *gensecrets.SecretRaw {
	sec := ps.Secret

	tags := make([]*gensecrets.SecretTag, 0, len(sec.Tags))
	for _, tag := range sec.Tags {
		tags = append(tags, &gensecrets.SecretTag{
			ID:   tag.ID.String(),
			Slug: tag.Slug,
		})
	}

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, &gensecrets.ResourceMetadata{
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

// buildImportSecretRaw converts a ProcessedSecret to the import API response type.
func (h *Handler) buildImportSecretRaw(ps *secretsvc.ProcessedSecret, projectID string) *gensecrets.ImportSecretRaw {
	sec := ps.Secret

	metadata := make([]*gensecrets.ResourceMetadata, 0, len(ps.Metadata))
	for _, m := range ps.Metadata {
		metadata = append(metadata, &gensecrets.ResourceMetadata{
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

// buildImportsResponse builds the imports array for the API response.
func (h *Handler) buildImportsResponse(
	result *secretsvc.ListSecretsResult,
	projectID string,
) []*gensecrets.SecretImport {
	secretsByImport := make(map[string][]secretsvc.ProcessedSecret)
	for i := range result.ImportedSecrets {
		sec := &result.ImportedSecrets[i]
		key := sec.ImportEnvironment + ":" + sec.ImportPath
		secretsByImport[key] = append(secretsByImport[key], *sec)
	}

	imports := make([]*gensecrets.SecretImport, 0, len(result.Imports))
	for i := range result.Imports {
		imp := &result.Imports[i]
		envSlug, _ := result.FolderLookup.GetEnvSlug(imp.EnvID)
		key := envSlug + ":" + imp.Path
		impSecrets := secretsByImport[key]

		importSecrets := make([]*gensecrets.ImportSecretRaw, 0, len(impSecrets))
		for j := range impSecrets {
			importSecrets = append(importSecrets, h.buildImportSecretRaw(&impSecrets[j], projectID))
		}

		folderID := imp.FolderID.String()
		imports = append(imports, &gensecrets.SecretImport{
			SecretPath:  imp.Path,
			Environment: envSlug,
			FolderID:    &folderID,
			Secrets:     importSecrets,
		})
	}

	return imports
}

// getUserID extracts user ID from identity if actor is a user.
func getUserID(identity *auth.Identity) *uuid.UUID {
	if identity.Actor == permission.ActorTypeUser {
		return &identity.ActorID
	}
	return nil
}

// getSecretType returns the secret type, defaulting to "shared" and forcing "shared" for non-user actors.
func getSecretType(identity *auth.Identity, requestedType string) string {
	if requestedType == "" {
		return "shared"
	}
	switch identity.Actor {
	case permission.ActorTypeIdentity, permission.ActorTypeService:
		return "shared"
	default:
		return requestedType
	}
}
