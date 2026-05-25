package secret

import (
	"context"
	"log/slog"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	permsecretsvc "github.com/infisical/api/internal/services/permission/secretmanager"
	secretsvc "github.com/infisical/api/internal/services/secretmanager/secret"
)

// GetSecretByNameV4 is the handler for getting a secret by name (V4).
func (h *Handler) GetSecretByNameV4(ctx context.Context, req *GetSecretByNameV4Request) (GetSecretByNameV4Response, error) {
	h.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("projectId", req.ProjectID),
		slog.String("environment", req.Environment),
		slog.String("secretPath", req.SecretPath),
		slog.String("secretName", req.SecretName),
	)

	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return GetSecretByNameV4Response{}, errutil.Unauthorized("Authentication required")
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
		return GetSecretByNameV4Response{}, err
	}

	result, err := h.secrets.GetSecretByName(ctx, &secretsvc.GetSecretByNameOpts{
		ProjectID:              req.ProjectID,
		Environment:            req.Environment,
		SecretPath:             req.SecretPath,
		SecretName:             req.SecretName,
		SecretType:             getSecretType(identity, req.Type),
		UserID:                 getUserID(identity),
		ViewSecretValue:        req.ViewSecretValue,
		ExpandSecretReferences: req.ExpandSecretReferences,
		IncludeImports:         req.IncludeImports,
		Access:                 secretsvc.AccessControl{Checker: permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)},
	})
	if err != nil {
		return GetSecretByNameV4Response{}, err
	}

	secretRaw := h.buildSecretRaw(result.Secret, req.ProjectID)

	if err := h.createGetSecretAuditLog(ctx, req.ProjectID, req.Environment, req.SecretPath, secretRaw); err != nil {
		return GetSecretByNameV4Response{}, err
	}

	return GetSecretByNameV4Response{Secret: secretRaw}, nil
}

// GetSecretByNameRawV3 is the handler for getting a raw secret by name (V3, deprecated).
func (h *Handler) GetSecretByNameRawV3(ctx context.Context, req *GetSecretByNameRawV3Request) (GetSecretByNameV4Response, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return GetSecretByNameV4Response{}, errutil.Unauthorized("Authentication required")
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, req.WorkspaceID, req.WorkspaceSlug)
	if err != nil {
		return GetSecretByNameV4Response{}, err
	}

	h.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", req.SecretName),
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(req.Environment)),
	)

	if req.Environment == nil || *req.Environment == "" {
		return GetSecretByNameV4Response{}, errutil.BadRequest("Environment is required")
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
		return GetSecretByNameV4Response{}, err
	}

	result, err := h.secrets.GetSecretByName(ctx, &secretsvc.GetSecretByNameOpts{
		ProjectID:              projectID,
		Environment:            *req.Environment,
		SecretPath:             req.SecretPath,
		SecretName:             req.SecretName,
		SecretType:             getSecretType(identity, req.Type),
		UserID:                 getUserID(identity),
		ViewSecretValue:        req.ViewSecretValue,
		ExpandSecretReferences: req.ExpandSecretReferences,
		IncludeImports:         req.IncludeImports,
		Access:                 secretsvc.AccessControl{Checker: permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)},
	})
	if err != nil {
		return GetSecretByNameV4Response{}, err
	}

	secretRaw := h.buildSecretRaw(result.Secret, projectID)

	if err := h.createGetSecretAuditLog(ctx, projectID, *req.Environment, req.SecretPath, secretRaw); err != nil {
		return GetSecretByNameV4Response{}, err
	}

	return GetSecretByNameV4Response{Secret: secretRaw}, nil
}

func (h *Handler) createGetSecretAuditLog(ctx context.Context, projectID, env, secretPath string, sec *SecretRaw) error {
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
			value := m.Value
			if m.IsEncrypted {
				value = auditlog.AuditLogSensitiveValue
			}
			secretMetadata[i] = auditlog.SecretMetadataEntry{
				Key:         m.Key,
				Value:       value,
				IsEncrypted: m.IsEncrypted,
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
