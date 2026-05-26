package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	permsecretsvc "github.com/infisical/api/internal/services/permission/secretmanager"
	secretsvc "github.com/infisical/api/internal/services/secretmanager/secret"
)

// getSecretByNameInternalOpts are the unified options for getting a secret by name.
type getSecretByNameInternalOpts struct {
	ProjectID              string
	Environment            string
	SecretPath             string
	SecretName             string
	SecretType             string
	UserID                 *uuid.UUID
	ViewSecretValue        bool
	ExpandSecretReferences bool
	IncludeImports         bool
}

// getSecretByName is the unified internal method for getting a secret by name.
// Both V3 and V4 handlers call this with different options.
func (h *Handler) getSecretByName(ctx context.Context, opts *getSecretByNameInternalOpts) (GetSecretByNameV4Response, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return GetSecretByNameV4Response{}, errutil.Unauthorized("Authentication required")
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
		return GetSecretByNameV4Response{}, err
	}
	checker := permsecretsvc.NewSecretAccessChecker(permResult.Permission.Ability)

	// 2. Fetch secret (permission-agnostic)
	result, err := h.secrets.GetSecretByName(ctx, &secretsvc.GetSecretByNameOpts{
		ProjectID:      opts.ProjectID,
		Environment:    opts.Environment,
		SecretPath:     opts.SecretPath,
		SecretName:     opts.SecretName,
		SecretType:     opts.SecretType,
		UserID:         opts.UserID,
		IncludeImports: opts.IncludeImports,
	})
	if err != nil {
		return GetSecretByNameV4Response{}, err
	}

	secret := result.Secret

	// 3. Permission check
	tagSlugs := make([]string, len(secret.Secret.Tags))
	for i, tag := range secret.Secret.Tags {
		tagSlugs[i] = tag.Slug
	}

	if !checker.CanDescribeSecret(secret.Environment, secret.SecretPath, secret.Secret.Key, tagSlugs) {
		return GetSecretByNameV4Response{}, errutil.Forbidden("Permission denied to access this secret")
	}

	canReadValue := checker.CanReadSecretValue(secret.Environment, secret.SecretPath, secret.Secret.Key, tagSlugs)
	if opts.ViewSecretValue && !canReadValue {
		return GetSecretByNameV4Response{}, errutil.Forbidden("Read value denied")
	}

	// 4. Set ValueHidden
	if !opts.ViewSecretValue || !canReadValue {
		secret.ValueHidden = true
		secret.Value = "<hidden-by-infisical>"
	}

	// 5. Expand if requested
	if opts.ExpandSecretReferences && !secret.ValueHidden && secret.RawValue != "" {
		// Load imports for expansion context if not already loaded
		allImports := result.Imports
		if len(allImports) == 0 {
			// Need to load imports for expansion
			importLookup, err := h.secrets.LoadProjectImports(ctx, opts.ProjectID)
			if err == nil {
				resolveFolder := func(envID uuid.UUID, path string) (uuid.UUID, bool) {
					node, ok := result.FolderLookup.GetByPath(envID, path)
					if !ok {
						return uuid.Nil, false
					}
					return node.ID, true
				}
				allImports = importLookup.ResolveChain(result.FolderID, resolveFolder)
			}
		}

		// Fetch context secrets for expansion
		allFolderIDs := []uuid.UUID{result.FolderID}
		for _, imp := range allImports {
			allFolderIDs = append(allFolderIDs, imp.FolderID)
		}

		allSecrets := []*secretsvc.ProcessedSecret{secret}

		contextSecrets, err := h.secrets.FindByFolderIds(ctx, allFolderIDs, opts.UserID, nil)
		if err == nil {
			for i := range contextSecrets {
				sec := &contextSecrets[i]
				if sec.ID == secret.Secret.ID {
					continue
				}

				ctxEnvSlug := secret.Environment
				ctxPath := secret.SecretPath
				if sec.FolderID != result.FolderID {
					for j := range allImports {
						if allImports[j].FolderID == sec.FolderID {
							ctxEnvSlug, _ = result.FolderLookup.GetEnvSlug(allImports[j].EnvID)
							ctxPath = allImports[j].Path
							break
						}
					}
				}

				// Check per-secret read permission with actual tags before adding to expansion context.
				// This prevents relative reference expansion from leaking secrets the user can't read.
				ctxTagSlugs := make([]string, len(sec.Tags))
				for j, tag := range sec.Tags {
					ctxTagSlugs[j] = tag.Slug
				}
				if !checker.CanReadSecretValue(ctxEnvSlug, ctxPath, sec.Key, ctxTagSlugs) {
					continue
				}

				ctxRawValue, ctxDisplayValue, ctxComment, ctxMetadata, _ := secretsvc.DecryptSecretFields(sec, result.CipherPair, false)
				allSecrets = append(allSecrets, &secretsvc.ProcessedSecret{
					Secret:      sec,
					SecretPath:  ctxPath,
					Environment: ctxEnvSlug,
					RawValue:    ctxRawValue,
					Value:       ctxDisplayValue,
					Comment:     ctxComment,
					Metadata:    ctxMetadata,
					ValueHidden: false,
				})
			}
		}

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
			return GetSecretByNameV4Response{}, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("denied refs: %v", expander.DeniedRefs())
		}
	}

	// 6. Build response
	secretRaw := h.buildSecretRaw(secret, opts.ProjectID)

	// 7. Audit log
	if err := h.createGetSecretAuditLog(ctx, opts.ProjectID, opts.Environment, opts.SecretPath, secretRaw); err != nil {
		return GetSecretByNameV4Response{}, err
	}

	return GetSecretByNameV4Response{Secret: secretRaw}, nil
}

// GetSecretByNameV4 is the handler for getting a secret by name (V4).
func (h *Handler) GetSecretByNameV4(ctx context.Context, req *GetSecretByNameV4Request) (GetSecretByNameV4Response, error) {
	h.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("projectId", req.ProjectID.Get()),
		slog.String("environment", req.Environment.Get()),
		slog.String("secretPath", req.SecretPath.Get()),
		slog.String("secretName", req.SecretName.Get()),
	)

	identity := auth.IdentityFromContext(ctx)

	return h.getSecretByName(ctx, &getSecretByNameInternalOpts{
		ProjectID:              req.ProjectID.Get(),
		Environment:            req.Environment.Get(),
		SecretPath:             req.SecretPath.Get(),
		SecretName:             req.SecretName.Get(),
		SecretType:             getSecretType(identity, req.Type.Get()),
		UserID:                 getUserID(identity),
		ViewSecretValue:        req.ViewSecretValue.Get(),
		ExpandSecretReferences: req.ExpandSecretReferences.Get(),
		IncludeImports:         req.IncludeImports.Get(),
	})
}

// GetSecretByNameRawV3 is the handler for getting a raw secret by name (V3, deprecated).
func (h *Handler) GetSecretByNameRawV3(ctx context.Context, req *GetSecretByNameRawV3Request) (GetSecretByNameV4Response, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return GetSecretByNameV4Response{}, errutil.Unauthorized("Authentication required")
	}

	// Convert Optional to *string for ResolveProjectID
	var workspaceID, workspaceSlug *string
	if req.WorkspaceID.IsSet() {
		v := req.WorkspaceID.Get()
		workspaceID = &v
	}
	if req.WorkspaceSlug.IsSet() {
		v := req.WorkspaceSlug.Get()
		workspaceSlug = &v
	}

	projectID, err := h.project.ResolveProjectID(ctx, identity.OrgID, workspaceID, workspaceSlug)
	if err != nil {
		return GetSecretByNameV4Response{}, err
	}

	h.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", req.SecretName.Get()),
		slog.String("projectId", projectID),
		slog.String("environment", req.Environment.Get()),
	)

	if !req.Environment.IsSet() || req.Environment.Get() == "" {
		return GetSecretByNameV4Response{}, errutil.BadRequest("Environment is required")
	}

	return h.getSecretByName(ctx, &getSecretByNameInternalOpts{
		ProjectID:              projectID,
		Environment:            req.Environment.Get(),
		SecretPath:             req.SecretPath.Get(),
		SecretName:             req.SecretName.Get(),
		SecretType:             getSecretType(identity, req.Type.Get()),
		UserID:                 getUserID(identity),
		ViewSecretValue:        req.ViewSecretValue.Get(),
		ExpandSecretReferences: req.ExpandSecretReferences.Get(),
		IncludeImports:         req.IncludeImports.Get(),
	})
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
			value := m.Value.Get()
			if m.IsEncrypted.Get() {
				value = auditlog.AuditLogSensitiveValue
			}
			secretMetadata[i] = auditlog.SecretMetadataEntry{
				Key:         m.Key.Get(),
				Value:       value,
				IsEncrypted: m.IsEncrypted.Get(),
			}
		}
	}

	dto := &auditlog.CreateAuditLogDTO{
		Event: auditlog.Event{
			Metadata: auditlog.GetSecretEventMetadata{
				Environment:    env,
				SecretPath:     secretPath,
				SecretID:       sec.ID.Get(),
				SecretKey:      sec.SecretKey.Get(),
				SecretVersion:  sec.Version.Get(),
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
