package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

// GetSecretByNameOpts contains options for getting a single secret.
type GetSecretByNameOpts struct {
	ProjectID              string
	Environment            string
	SecretPath             string
	SecretName             string
	SecretType             string
	UserID                 *uuid.UUID
	ViewSecretValue        bool
	ExpandSecretReferences bool
	IncludeImports         bool
	Access                 AccessControl
}

// GetSecretByNameResult contains the result of getting a secret by name.
type GetSecretByNameResult struct {
	Secret *ProcessedSecret
}

// GetSecretByName retrieves a single secret by name with full processing.
func (s *Service) GetSecretByName(ctx context.Context, opts *GetSecretByNameOpts) (*GetSecretByNameResult, error) {
	// 1. Load all folders for project
	folderLookup, err := s.secretFolderService.LoadFolders(ctx, opts.ProjectID, nil)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("GetSecretByName: %w", err)
	}

	// 2. Get starting environment by slug (every env has a root folder)
	envID, ok := folderLookup.GetEnvIDBySlug(opts.Environment)
	if !ok {
		return nil, errutil.NotFound("Environment not found")
	}

	// 3. Get folder
	folderNode, ok := folderLookup.GetByPath(envID, opts.SecretPath)
	if !ok {
		return nil, errutil.NotFound("Folder not found")
	}

	// 4. Get cipher pair
	cipherPair, err := s.kmsService.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("GetSecretByName: %w", err)
	}

	// 5. Find secret
	secretType := opts.SecretType
	if secretType == "" {
		secretType = "shared"
	}

	foundSecret, err := s.FindByKey(ctx, folderNode.ID, opts.SecretName, secretType, opts.UserID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find secret").WithErrf("GetSecretByName: %w", err)
	}

	secretEnv := opts.Environment
	secretPath := opts.SecretPath

	// 6. Search imports if not found
	var importLookup *secretimport.ImportLookup
	var allImports []secretimport.ResolvedImport

	if foundSecret == nil && opts.IncludeImports {
		importLookup, err = s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("GetSecretByName: %w", err)
		}

		// Resolve import chain
		resolveFolder := func(envID uuid.UUID, path string) (uuid.UUID, bool) {
			node, ok := folderLookup.GetByPath(envID, path)
			if !ok {
				return uuid.Nil, false
			}
			return node.ID, true
		}

		allImports = importLookup.ResolveChain(folderNode.ID, resolveFolder)

		// Search imports in reverse order (later imports have higher priority)
		for i := len(allImports) - 1; i >= 0; i-- {
			imp := &allImports[i]
			importedSecret, err := s.FindByKey(ctx, imp.FolderID, opts.SecretName, secretType, opts.UserID)
			if err != nil {
				continue
			}
			if importedSecret != nil {
				foundSecret = importedSecret
				secretEnv, _ = folderLookup.GetEnvSlug(imp.EnvID)
				secretPath = imp.Path
				break
			}
		}
	}

	if foundSecret == nil {
		return nil, errutil.NotFound("Secret not found")
	}

	// 7. Check permissions
	tagSlugs := make([]string, len(foundSecret.Tags))
	for i, tag := range foundSecret.Tags {
		tagSlugs[i] = tag.Slug
	}

	if !opts.Access.CanDescribe(secretEnv, secretPath, foundSecret.Key, tagSlugs) {
		return nil, errutil.Forbidden("permission denied to access this secret")
	}

	canReadValue := opts.Access.CanReadValue(secretEnv, secretPath, foundSecret.Key, tagSlugs)
	if opts.ViewSecretValue && !canReadValue {
		return nil, errutil.Forbidden("Read value denied")
	}

	// 8. Decrypt value and comment
	valueHidden := !opts.ViewSecretValue || !canReadValue

	rawValue, displayValue, secretComment, metadata, decryptErrs := decryptSecretFields(foundSecret, cipherPair, valueHidden)
	if decryptErrs.HasErrors() {
		s.logger.WarnContext(ctx, "secret decryption errors (fail-open: returning empty values)",
			slog.String("secretId", foundSecret.ID.String()),
			slog.Any("valueErr", decryptErrs.ValueErr),
			slog.Any("commentErr", decryptErrs.CommentErr),
			slog.Any("metadataErr", decryptErrs.MetadataErr))
	}

	// Build the result secret
	resultSecret := &ProcessedSecret{
		Secret:      foundSecret,
		SecretPath:  secretPath,
		Environment: secretEnv,
		RawValue:    rawValue,
		Value:       displayValue,
		Comment:     secretComment,
		Metadata:    metadata,
		ValueHidden: valueHidden,
	}

	// 9. Expand references if requested
	if opts.ExpandSecretReferences && !valueHidden && rawValue != "" {
		// Load imports if not already loaded
		if importLookup == nil {
			importLookup, err = s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
			if err != nil {
				return nil, errutil.InternalServer("Failed to load imports for expansion").WithErrf("GetSecretByName: %w", err)
			}

			resolveFolder := func(envID uuid.UUID, path string) (uuid.UUID, bool) {
				node, ok := folderLookup.GetByPath(envID, path)
				if !ok {
					return uuid.Nil, false
				}
				return node.ID, true
			}
			allImports = importLookup.ResolveChain(folderNode.ID, resolveFolder)
		}

		// Fetch context secrets from same folder + imported folders
		allFolderIDs := []uuid.UUID{folderNode.ID}
		for _, imp := range allImports {
			allFolderIDs = append(allFolderIDs, imp.FolderID)
		}

		// Build list of secrets for expansion: main secret + context secrets
		allSecrets := []*ProcessedSecret{resultSecret}

		contextSecrets, err := s.FindByFolderIds(ctx, allFolderIDs, opts.UserID, nil)
		if err != nil {
			return nil, errutil.InternalServer("Failed to fetch context secrets for expansion").WithErrf("GetSecretByName: %w", err)
		}

		for i := range contextSecrets {
			sec := &contextSecrets[i]
			if sec.ID == foundSecret.ID {
				continue // Skip the main secret, already added
			}

			// Determine environment and path for this context secret
			ctxEnvSlug := secretEnv
			ctxPath := secretPath
			if sec.FolderID != folderNode.ID {
				// This is from an imported folder
				for j := range allImports {
					if allImports[j].FolderID == sec.FolderID {
						ctxEnvSlug, _ = folderLookup.GetEnvSlug(allImports[j].EnvID)
						ctxPath = allImports[j].Path
						break
					}
				}
			}

			ctxRawValue, ctxDisplayValue, ctxComment, ctxMetadata, ctxDecryptErrs := decryptSecretFields(sec, cipherPair, false)
			if ctxDecryptErrs.HasErrors() {
				s.logger.WarnContext(ctx, "context secret decryption errors (fail-open)",
					slog.String("secretId", sec.ID.String()),
					slog.Any("valueErr", ctxDecryptErrs.ValueErr))
			}
			allSecrets = append(allSecrets, &ProcessedSecret{
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

		expander := NewSecretExpander(allSecrets, ExpandOpts{
			CanAccessAbsolute: func(ref AbsoluteSecretRef) bool {
				return opts.Access.CanReadValue(ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []*ProcessedSecret {
				return s.fetchAbsoluteSecrets(ctx, refs, absoluteFetchOpts{
					projectID:    opts.ProjectID,
					folderLookup: folderLookup,
					cipherPair:   cipherPair,
					userID:       opts.UserID,
				})
			},
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("GetSecretByName: denied refs: %v", expander.DeniedRefs())
		}
	}

	return &GetSecretByNameResult{
		Secret: resultSecret,
	}, nil
}
