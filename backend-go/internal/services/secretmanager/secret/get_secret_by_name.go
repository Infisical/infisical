package secret

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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
	AccessChecker          AccessChecker // nil = skip permission checks
}

// GetSecretByNameResult contains the result of getting a secret by name.
type GetSecretByNameResult struct {
	Secret *ProcessedSecret
}

// GetSecretByName retrieves a single secret by name with full processing.
func (s *Service) GetSecretByName(ctx context.Context, opts *GetSecretByNameOpts) (*GetSecretByNameResult, error) {
	// 1. Get starting environment by slug
	envID, err := s.getEnvBySlug(ctx, opts.ProjectID, opts.Environment)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("Environment not found")
		}
		return nil, errutil.DatabaseErr("Failed to load environment").WithErrf("GetSecretByName: %w", err)
	}

	// 2. Load folder
	folderLookup, err := s.secretFolderService.LoadProjectFolders(ctx, opts.ProjectID, []uuid.UUID{envID})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("GetSecretByName: %w", err)
	}

	folderNode, ok := folderLookup.GetByPath(envID, opts.SecretPath)
	if !ok {
		return nil, errutil.NotFound("Folder not found")
	}

	// 3. Get cipher pair
	cipherPair, err := s.kmsService.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("GetSecretByName: %w", err)
	}

	// 4. Find secret
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

	// 5. Search imports if not found
	if foundSecret == nil && opts.IncludeImports {
		importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("GetSecretByName: %w", err)
		}

		chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderService)
		chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, envID, opts.SecretPath, false)
		if err == nil && len(chainResult.Imports) > 0 {
			folderLookup.Merge(chainResult.FolderLookup)

			for i := len(chainResult.Imports) - 1; i >= 0; i-- {
				imp := &chainResult.Imports[i]
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
	}

	if foundSecret == nil {
		return nil, errutil.NotFound("Secret not found")
	}

	// 6. Check permissions
	tagSlugs := make([]string, len(foundSecret.Tags))
	for i, tag := range foundSecret.Tags {
		tagSlugs[i] = tag.Slug
	}

	if opts.AccessChecker != nil {
		canDescribe := opts.AccessChecker.CanDescribeSecret(secretEnv, secretPath, foundSecret.Key, tagSlugs)
		if !canDescribe {
			return nil, errutil.Forbidden("permission denied to access this secret")
		}

		canReadValue := opts.AccessChecker.CanReadSecretValue(secretEnv, secretPath, foundSecret.Key, tagSlugs)
		if opts.ViewSecretValue && !canReadValue {
			return nil, errutil.Forbidden("Read value denied")
		}
	}

	// 7. Decrypt value and comment
	valueHidden := !opts.ViewSecretValue
	if opts.AccessChecker != nil {
		canReadValue := opts.AccessChecker.CanReadSecretValue(secretEnv, secretPath, foundSecret.Key, tagSlugs)
		valueHidden = valueHidden || !canReadValue
	}

	rawValue, displayValue, secretComment, metadata := decryptSecretFields(foundSecret, cipherPair, valueHidden)

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

	// 8. Expand references if requested
	if opts.ExpandSecretReferences && !valueHidden && rawValue != "" {
		importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
		if err != nil {
			return nil, errutil.InternalServer("Failed to load imports for expansion").WithErrf("GetSecretByName: %w", err)
		}
		chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderService)
		chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, envID, opts.SecretPath, false)
		if err != nil {
			return nil, errutil.InternalServer("Failed to resolve import chain for expansion").WithErrf("GetSecretByName: %w", err)
		}
		folderLookup.Merge(chainResult.FolderLookup)

		// Always fetch from same folder + imported folders for relative ref resolution
		allFolderIDs := []uuid.UUID{folderNode.ID}
		if len(chainResult.Imports) > 0 {
			allFolderIDs = append(allFolderIDs, chainResult.ImportedFolderIDs()...)
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
				for i := range chainResult.Imports {
					if chainResult.Imports[i].FolderID == sec.FolderID {
						ctxEnvSlug, _ = folderLookup.GetEnvSlug(chainResult.Imports[i].EnvID)
						ctxPath = chainResult.Imports[i].Path
						break
					}
				}
			}

			ctxRawValue, ctxDisplayValue, ctxComment, ctxMetadata := decryptSecretFields(sec, cipherPair, false)
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
				if opts.AccessChecker == nil {
					return true
				}
				return opts.AccessChecker.CanReadSecretValue(ref.Env, ref.Path, ref.Key, nil)
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
		// resultSecret.Value is already expanded in place
	}

	return &GetSecretByNameResult{
		Secret: resultSecret,
	}, nil
}
