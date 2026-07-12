package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
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

// getSecretByNameResponse is the internal response type.
type getSecretByNameResponse struct {
	Secret SecretRaw
}

// getSecretByName is the unified internal method for getting a secret by name.
// Both V3 and V4 handlers call this with different options.
func (h *Handler) getSecretByName(ctx context.Context, opts *getSecretByNameInternalOpts) (*getSecretByNameResponse, error) {
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
		return nil, err
	}

	secret := result.Secret

	// 3. Permission check
	tagSlugs := make([]string, len(secret.Secret.Tags))
	for i, tag := range secret.Secret.Tags {
		tagSlugs[i] = tag.Slug
	}

	if !checker.CanDescribeSecret(secret.Environment, secret.SecretPath, secret.Secret.Key, tagSlugs) {
		return nil, errutil.Forbidden("Permission denied to access this secret")
	}

	canReadValue := checker.CanReadSecretValue(secret.Environment, secret.SecretPath, secret.Secret.Key, tagSlugs)
	if opts.ViewSecretValue && !canReadValue {
		return nil, errutil.Forbidden("Read value denied")
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
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("denied refs: %v", expander.DeniedRefs())
		}
	}

	// 6. Build response
	secretRaw := h.buildSecretRaw(secret, opts.ProjectID)

	// TODO: Re-enable audit logging once Go backend is primary
	// // 7. Audit log
	// if err := h.createGetSecretAuditLog(ctx, opts.ProjectID, opts.Environment, opts.SecretPath, &secretRaw); err != nil {
	// 	return nil, err
	// }

	return &getSecretByNameResponse{Secret: secretRaw}, nil
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
		IncludeImports:         fn.ValueOr(q.IncludeImports, false), // V3 defaults to false (unlike V4)
	})
	if err != nil {
		return nil, err
	}

	return NewGetSecretByNameRawV3ResponseData(&GetSecretByNameRawV3Response{
		Secret: response.Secret,
	}), nil
}

func (h *Handler) CreateGetSecretAuditLog(ctx context.Context, projectID, env, secretPath string, sec *SecretRaw) error {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil {
		return errutil.NotFound("Identity not found in context").WithErr(err)
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
