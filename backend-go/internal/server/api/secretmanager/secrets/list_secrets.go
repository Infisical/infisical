package secrets

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/secret"
)

func (h *Handler) ListSecretsV4(ctx context.Context, p *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	h.logger.InfoContext(ctx, "listing secrets v4",
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
		slog.String("secretPath", p.SecretPath),
	)

	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required")
	}

	permResult, err := h.permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           identity.ActorID,
		ProjectID:         p.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        identity.OrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return nil, err
	}

	behavior := secret.PersonalOverridesNeverInclude
	if p.IncludePersonalOverrides {
		behavior = secret.PersonalOverridesPriority
	}

	result, err := h.secrets.ListSecrets(ctx, &secret.ListSecretsOpts{
		ProjectID:                 p.ProjectID,
		Environment:               p.Environment,
		SecretPath:                p.SecretPath,
		UserID:                    getUserID(identity),
		ViewSecretValue:           p.ViewSecretValue,
		ExpandSecretReferences:    p.ExpandSecretReferences,
		Recursive:                 p.Recursive,
		PersonalOverridesBehavior: behavior,
		ExpandPersonalOverrides:   p.IncludePersonalOverrides,
		TagSlugs:                  parseTagSlugs(p.TagSlugs),
		MetadataFilter:            parseMetadataFilter(p.MetadataFilter),
		AccessChecker:             buildAccessChecker(permResult),
	})
	if err != nil {
		return nil, err
	}

	response := h.buildListSecretsResponse(result, p.ProjectID, p.IncludeImports)

	if err := h.createGetSecretsAuditLog(ctx, p.ProjectID, p.Environment, p.SecretPath, len(response.Secrets)); err != nil {
		return nil, err
	}

	return response, nil
}

func (h *Handler) ListSecretsRawV3(ctx context.Context, p *gensecrets.ListSecretsRawV3Payload) (*gensecrets.ListSecretsResult, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required")
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, p.WorkspaceID, p.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "listing secrets raw v3",
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(p.Environment)),
		slog.String("secretPath", p.SecretPath),
	)

	if p.Environment == nil || *p.Environment == "" {
		return nil, errutil.BadRequest("Environment is required")
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
		return nil, err
	}

	result, err := h.secrets.ListSecrets(ctx, &secret.ListSecretsOpts{
		ProjectID:                 projectID,
		Environment:               *p.Environment,
		SecretPath:                p.SecretPath,
		UserID:                    getUserID(identity),
		ViewSecretValue:           p.ViewSecretValue,
		ExpandSecretReferences:    p.ExpandSecretReferences,
		Recursive:                 p.Recursive,
		PersonalOverridesBehavior: secret.PersonalOverridesIncludeAll,
		TagSlugs:                  parseTagSlugs(p.TagSlugs),
		MetadataFilter:            parseMetadataFilter(p.MetadataFilter),
		AccessChecker:             buildAccessChecker(permResult),
	})
	if err != nil {
		return nil, err
	}

	response := h.buildListSecretsResponse(result, projectID, p.IncludeImports)

	if err := h.createGetSecretsAuditLog(ctx, projectID, *p.Environment, p.SecretPath, len(response.Secrets)); err != nil {
		return nil, err
	}

	return response, nil
}

func (h *Handler) buildListSecretsResponse(
	result *secret.ListSecretsResult,
	projectID string,
	includeImports bool,
) *gensecrets.ListSecretsResult {
	secretsResponse := make([]*gensecrets.SecretRaw, 0, len(result.DirectSecrets))
	for i := range result.DirectSecrets {
		secretsResponse = append(secretsResponse, h.buildSecretRaw(&result.DirectSecrets[i], projectID))
	}

	var importsResponse []*gensecrets.SecretImport
	if includeImports {
		importsResponse = h.buildImportsResponse(result, projectID)
	}

	return &gensecrets.ListSecretsResult{
		Secrets: secretsResponse,
		Imports: importsResponse,
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

	if err := h.auditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf("createGetSecretsAuditLog: %w", err)
	}

	return nil
}

func ptrToString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
