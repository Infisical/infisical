package secrets

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	secretsexpansion "github.com/infisical/api/internal/services/secretmanager/secrets"
)

// GetSecretOpts contains the options for getting a single secret by name.
type GetSecretOpts struct {
	ProjectID              string
	Environment            string
	SecretPath             string
	SecretName             string
	SecretType             string
	ViewSecretValue        bool
	ExpandSecretReferences bool
	IncludeImports         bool
}

// getSecretByNameCore is the shared implementation for v3 and v4 get secret by name endpoints.
func (h *Handler) getSecretByNameCore(ctx context.Context, opts *GetSecretOpts) (*gensecrets.GetSecretResult, error) {
	identity := auth.IdentityFromContext(ctx)
	if identity == nil {
		return nil, errutil.Unauthorized("Authentication required").WithErrf("getSecretByNameCore: identity not in context")
	}

	actorID := identity.ActorID
	orgID := identity.OrgID

	// Get project permission
	permResult, err := h.sharedSvc.Permission.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             identity.Actor,
		ActorID:           actorID,
		ProjectID:         opts.ProjectID,
		ActorAuthMethod:   identity.AuthMethod,
		ActorOrgID:        orgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to get project permission").WithErrf("GetSecretByName(projectId=%s): %w", opts.ProjectID, err)
	}

	// Load environments
	allEnvs, err := h.secretManagerSvc.EnvironmentDAL.GetAllByProjectID(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("GetSecretByName(projectId=%s): %w", opts.ProjectID, err)
	}

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
		return nil, errutil.NotFound("Environment not found").WithErrf("GetSecretByName: environment '%s' not found in project", opts.Environment)
	}

	// Load folder
	folderLookup, err := h.secretManagerSvc.SecretFolder.LoadProjectFolders(ctx, opts.ProjectID, []uuid.UUID{env.ID})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("GetSecretByName(projectId=%s): %w", opts.ProjectID, err)
	}

	folderNode, ok := folderLookup.GetByPath(env.ID, opts.SecretPath)
	if !ok {
		return nil, errutil.NotFound("Folder not found").WithErrf("GetSecretByName: folder path '%s' not found in environment '%s'", opts.SecretPath, opts.Environment)
	}

	// Get KMS cipher pair
	cipherPair, err := h.sharedSvc.KMS.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("GetSecretByName(projectId=%s): %w", opts.ProjectID, err)
	}

	// Prepare user ID for personal secrets
	var userID *uuid.UUID
	secretType := opts.SecretType
	if secretType == "" {
		secretType = "shared"
	}
	switch identity.Actor {
	case permission.ActorTypeIdentity, permission.ActorTypeService:
		// Identities and service tokens can't have personal secrets - force to shared
		secretType = "shared"
	case permission.ActorTypeUser:
		userID = &actorID
	}

	// Find the secret by name
	foundSecret, err := h.secretManagerSvc.SecretDAL.FindByKey(ctx, folderNode.ID, opts.SecretName, secretType, userID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find secret").WithErrf("GetSecretByName(secretName=%s): %w", opts.SecretName, err)
	}

	// If not found in direct folder and includeImports is true, search imports
	if foundSecret == nil && opts.IncludeImports {
		importLookup, err := h.secretManagerSvc.SecretImport.LoadProjectImports(ctx, opts.ProjectID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("GetSecretByName(projectId=%s): %w", opts.ProjectID, err)
		}

		chainResolver := secretimport.NewChainResolver(importLookup, h.secretManagerSvc.SecretFolder)
		chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, false, envByID)
		if err == nil && len(chainResult.Imports) > 0 {
			// Search imports in reverse order (last import wins)
			for i := len(chainResult.Imports) - 1; i >= 0; i-- {
				imp := &chainResult.Imports[i]
				importedSecret, err := h.secretManagerSvc.SecretDAL.FindByKey(ctx, imp.FolderID, opts.SecretName, secretType, userID)
				if err != nil {
					continue
				}
				if importedSecret != nil {
					foundSecret = importedSecret
					break
				}
			}
		}
	}

	if foundSecret == nil {
		return nil, errutil.NotFound("Secret not found").WithErrf("GetSecretByName: secret with name '%s' not found", opts.SecretName)
	}

	// Check permissions
	tagSlugs := make([]string, len(foundSecret.Tags))
	for i, tag := range foundSecret.Tags {
		tagSlugs[i] = tag.Slug
	}

	canDescribe := permission.CanDescribeSecret(permResult.Permission.Ability, opts.Environment, opts.SecretPath, foundSecret.Key, tagSlugs)
	if !canDescribe {
		return nil, errutil.Forbidden("You do not have permission to access this secret").WithErrf("getSecretByNameCore(secretName=%s, env=%s, path=%s): describe denied", opts.SecretName, opts.Environment, opts.SecretPath)
	}

	canReadValue := permission.CanReadSecretValue(permResult.Permission.Ability, opts.Environment, opts.SecretPath, foundSecret.Key, tagSlugs)
	valueHidden := !opts.ViewSecretValue || !canReadValue

	if opts.ViewSecretValue && !canReadValue {
		return nil, errutil.Forbidden("You do not have permission to view this secret value").WithErrf("getSecretByNameCore(secretName=%s, env=%s, path=%s): read value denied", opts.SecretName, opts.Environment, opts.SecretPath)
	}

	// Decrypt value and comment
	var secretValue, secretComment string
	if !valueHidden && foundSecret.EncryptedValue.Valid && len(foundSecret.EncryptedValue.V) > 0 {
		if decrypted, err := cipherPair.Decrypt(foundSecret.EncryptedValue.V); err == nil {
			secretValue = string(decrypted)
		}
	}
	if valueHidden {
		secretValue = secretValueHiddenMask
	}

	if foundSecret.EncryptedComment.Valid && len(foundSecret.EncryptedComment.V) > 0 {
		if decrypted, err := cipherPair.Decrypt(foundSecret.EncryptedComment.V); err == nil {
			secretComment = string(decrypted)
		}
	}

	// Expand references if requested
	if opts.ExpandSecretReferences && !valueHidden && secretValue != "" {
		importLookup, _ := h.secretManagerSvc.SecretImport.LoadProjectImports(ctx, opts.ProjectID)
		chainResolver := secretimport.NewChainResolver(importLookup, h.secretManagerSvc.SecretFolder)
		chainResult, _ := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, false, envByID)

		// Build inputs for expansion with the single secret
		inputs := []secretsexpansion.SecretInput{{
			ID:         foundSecret.ID,
			Key:        foundSecret.Key,
			Value:      secretValue,
			Env:        opts.Environment,
			Path:       opts.SecretPath,
			IsImported: false,
		}}

		// Add imported secrets for reference resolution
		if len(chainResult.Imports) > 0 {
			allFolderIDs := chainResult.AllFolderIDs()
			importedSecrets, _ := h.secretManagerSvc.SecretDAL.FindByFolderIds(ctx, allFolderIDs, userID, nil)
			for i := range importedSecrets {
				sec := &importedSecrets[i]
				if sec.ID == foundSecret.ID {
					continue
				}
				var val string
				if sec.EncryptedValue.Valid && len(sec.EncryptedValue.V) > 0 {
					if decrypted, err := cipherPair.Decrypt(sec.EncryptedValue.V); err == nil {
						val = string(decrypted)
					}
				}
				inputs = append(inputs, secretsexpansion.SecretInput{
					ID:         sec.ID,
					Key:        sec.Key,
					Value:      val,
					Env:        opts.Environment,
					Path:       opts.SecretPath,
					IsImported: true,
				})
			}
		}

		absoluteFetcher := newAbsoluteSecretFetcher(
			ctx,
			opts.ProjectID,
			envBySlug,
			folderLookup,
			h.secretManagerSvc.SecretFolder,
			h.secretManagerSvc.SecretDAL,
			cipherPair,
			userID,
		)

		expander := secretsexpansion.NewSecretExpander(inputs, secretsexpansion.ExpandOpts{
			CanAccessAbsolute: func(ref secretsexpansion.AbsoluteSecretRef) bool {
				return permission.CanReadSecretValue(permResult.Permission.Ability, ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: absoluteFetcher.Fetch,
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			deniedRefs := expander.DeniedRefs()
			return nil, errutil.Forbidden("Failed to expand one or more secret references").
				WithErrf("denied refs: %v", deniedRefs)
		}

		if expanded, ok := expander.LookUp(foundSecret.ID); ok {
			secretValue = expanded
		}
	}

	// Build response
	processed := &processedSecret{
		Secret:      foundSecret,
		SecretPath:  opts.SecretPath,
		Environment: opts.Environment,
		Value:       secretValue,
		Comment:     secretComment,
		ValueHidden: valueHidden,
	}

	return &gensecrets.GetSecretResult{
		Secret: h.buildSecretRaw(processed, opts.ProjectID, cipherPair),
	}, nil
}

func (h *Handler) GetSecretByNameV4(ctx context.Context, p *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	h.logger.InfoContext(ctx, "getting secret by name v4",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", p.ProjectID),
		slog.String("environment", p.Environment),
	)

	result, err := h.getSecretByNameCore(ctx, &GetSecretOpts{
		ProjectID:              p.ProjectID,
		Environment:            p.Environment,
		SecretPath:             p.SecretPath,
		SecretName:             p.SecretName,
		SecretType:             p.Type,
		ViewSecretValue:        p.ViewSecretValue,
		ExpandSecretReferences: p.ExpandSecretReferences,
		IncludeImports:         p.IncludeImports,
	})
	if err != nil {
		return nil, err
	}

	if err := h.createGetSecretAuditLog(ctx, p.ProjectID, p.Environment, p.SecretPath, result.Secret); err != nil {
		return nil, err
	}

	return result, nil
}

func (h *Handler) GetSecretByNameRawV3(ctx context.Context, p *gensecrets.GetSecretByNameRawV3Payload) (*gensecrets.GetSecretResult, error) {
	// Resolve project ID from workspaceId or workspaceSlug
	projectID, err := h.resolveProjectID(ctx, p.WorkspaceID, p.WorkspaceSlug)
	if err != nil {
		return nil, err
	}

	h.logger.InfoContext(ctx, "getting secret by name raw v3",
		slog.String("secretName", p.SecretName),
		slog.String("projectId", projectID),
		slog.String("environment", ptrToString(p.Environment)),
	)

	// Environment is required for this endpoint
	if p.Environment == nil || *p.Environment == "" {
		return nil, errutil.BadRequest("Environment is required").WithErrf("GetSecretByNameRawV3: environment param missing")
	}

	result, err := h.getSecretByNameCore(ctx, &GetSecretOpts{
		ProjectID:              projectID,
		Environment:            *p.Environment,
		SecretPath:             p.SecretPath,
		SecretName:             p.SecretName,
		SecretType:             p.Type,
		ViewSecretValue:        p.ViewSecretValue,
		ExpandSecretReferences: p.ExpandSecretReferences,
		IncludeImports:         p.IncludeImports,
	})
	if err != nil {
		return nil, err
	}

	if err := h.createGetSecretAuditLog(ctx, projectID, *p.Environment, p.SecretPath, result.Secret); err != nil {
		return nil, err
	}

	return result, nil
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

	if err := h.sharedSvc.AuditLog.CreateAuditLog(ctx, dto); err != nil {
		return errutil.InternalServer("Failed to create audit log").WithErrf(
			"createGetSecretAuditLog(project=%s, env=%s, path=%s, key=%s): %w", projectID, env, secretPath, sec.SecretKey, err)
	}

	return nil
}
