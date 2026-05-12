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

func (h *Handler) GetSecretByNameV4(ctx context.Context, p *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	h.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
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

	result, err := h.secrets.GetSecretByName(ctx, &secret.GetSecretByNameOpts{
		ProjectID:              p.ProjectID,
		Environment:            p.Environment,
		SecretPath:             p.SecretPath,
		SecretName:             p.SecretName,
		SecretType:             getSecretType(identity, p.Type),
		UserID:                 getUserID(identity),
		ViewSecretValue:        p.ViewSecretValue,
		ExpandSecretReferences: p.ExpandSecretReferences,
		IncludeImports:         p.IncludeImports,
		AccessChecker:          buildAccessChecker(permResult),
	})
	if err != nil {
		return nil, err
	}

	secretRaw := h.buildSecretRaw(result.Secret, p.ProjectID)

	if err := h.createGetSecretAuditLog(ctx, p.ProjectID, p.Environment, p.SecretPath, secretRaw); err != nil {
		return nil, err
	}

	return &gensecrets.GetSecretResult{Secret: secretRaw}, nil
}

func (h *Handler) GetSecretByNameRawV3(ctx context.Context, p *gensecrets.GetSecretByNameRawV3Payload) (*gensecrets.GetSecretResult, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required")
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, p.WorkspaceID, p.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(p.Environment)),
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

	result, err := h.secrets.GetSecretByName(ctx, &secret.GetSecretByNameOpts{
		ProjectID:              projectID,
		Environment:            *p.Environment,
		SecretPath:             p.SecretPath,
		SecretName:             p.SecretName,
		SecretType:             getSecretType(identity, p.Type),
		UserID:                 getUserID(identity),
		ViewSecretValue:        p.ViewSecretValue,
		ExpandSecretReferences: p.ExpandSecretReferences,
		IncludeImports:         p.IncludeImports,
		AccessChecker:          buildAccessChecker(permResult),
	})
	if err != nil {
		return nil, err
	}

	secretRaw := h.buildSecretRaw(result.Secret, projectID)

	if err := h.createGetSecretAuditLog(ctx, projectID, *p.Environment, p.SecretPath, secretRaw); err != nil {
		return nil, err
	}

	return &gensecrets.GetSecretResult{Secret: secretRaw}, nil
}

func (h *Handler) createGetSecretAuditLog(ctx context.Context, projectID, env, secretPath string, sec *gensecrets.SecretRaw) error {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil
	}

	info := auditlog.BuildAuditLogInfo(identity)
	if info == nil {
		return nil
	}

	var secretMetadata []auditlog.SecretMetadataEntry
	if sec.SecretMetadata != nil {
		secretMetadata = make([]auditlog.SecretMetadataEntry, len(sec.SecretMetadata))
		for i, m := range sec.SecretMetadata {
			secretMetadata[i] = auditlog.SecretMetadataEntry{
				Key:   m.Key,
				Value: m.Value,
			}
		}
	}

	dto := &auditlog.CreateAuditLogDTO{
		Event: auditlog.Event{
			Metadata: auditlog.GetSecretEventMetadata{
				Environment:    env,
				SecretPath:     secretPath,
				SecretID:       sec.ID,
				SecretKey:      sec.SecretKey,
				SecretVersion:  sec.Version,
				SecretMetadata: secretMetadata,
			},
		},
		Actor:         info.Actor,
		ProjectID:     &projectID,
		IPAddress:     info.IPAddress,
		UserAgent:     info.UserAgent,
		UserAgentType: info.UserAgentType,
	}

	if err := h.auditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf("createGetSecretAuditLog: %w", err)
	}

	return nil
}
