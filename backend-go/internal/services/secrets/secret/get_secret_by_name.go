package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secrets/secretfolder"
	"github.com/infisical/api/internal/services/secrets/secretimport"
)

// GetSecretByNameOpts contains options for getting a single secret.
// The service is permission-agnostic - all permission logic happens in the handler.
type GetSecretByNameOpts struct {
	ProjectID      string
	Environment    string
	SecretPath     string
	SecretName     string
	SecretType     string
	UserID         *uuid.UUID
	IncludeImports bool
	Version        *int // when set, read this historical version instead of the live secret
}

// GetSecretByNameResult contains the result of getting a secret by name.
type GetSecretByNameResult struct {
	Secret       *ProcessedSecret
	FolderLookup *secretfolder.FolderLookup    // For handler expansion
	CipherPair   *kms.CipherPair               // For handler expansion
	Imports      []secretimport.ResolvedImport // Context for handler expansion
	FolderID     uuid.UUID                     // The folder where the secret was requested
}

// GetSecretByName retrieves a single secret by name.
// This is permission-agnostic - returns the secret if found. Handler filters by permission.
func (s *Service) GetSecretByName(ctx context.Context, opts *GetSecretByNameOpts) (*GetSecretByNameResult, error) {
	folderLookup, err := s.secretFolderService.LoadFolders(ctx, opts.ProjectID, nil)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("GetSecretByName: %w", err)
	}

	envID, ok := folderLookup.GetEnvIDBySlug(opts.Environment)
	if !ok {
		return nil, errutil.NotFound("Environment not found")
	}

	folderNode, ok := folderLookup.GetByPath(envID, opts.SecretPath)
	if !ok {
		return nil, errutil.NotFound("Folder not found")
	}

	cipherPair, err := s.kmsService.CreateCipherPairWithProjectDataKey(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("GetSecretByName: %w", err)
	}

	secretType := opts.SecretType
	if secretType == "" {
		secretType = "shared"
	}

	var keyOpts []FindByKeyOption
	if secretType == "personal" && opts.UserID != nil {
		keyOpts = append(keyOpts, WithPersonalType(*opts.UserID))
	}

	lookupOpts := keyOpts
	if opts.Version != nil {
		lookupOpts = append(append([]FindByKeyOption{}, keyOpts...), WithVersion(*opts.Version))
	}

	foundSecret, err := s.FindByKey(ctx, folderNode.ID, opts.SecretName, lookupOpts...)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find secret").WithErrf("GetSecretByName: %w", err)
	}

	secretEnv := opts.Environment
	secretPath := opts.SecretPath

	var allImports []secretimport.ResolvedImport

	// Imports apply to live lookups only; a versioned read targets a specific
	// secret's history and never falls back to imports.
	if foundSecret == nil && opts.IncludeImports && opts.Version == nil {
		importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("GetSecretByName: %w", err)
		}

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
			importedSecret, err := s.FindByKey(ctx, imp.FolderID, opts.SecretName, keyOpts...)
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

	// Verify personal secret ownership (defense in depth)
	if foundSecret.Type == "personal" {
		if opts.UserID == nil || !foundSecret.UserID.Valid || foundSecret.UserID.V != *opts.UserID {
			return nil, errutil.Forbidden("Cannot access personal secret belonging to another user")
		}
	}

	rawValue, displayValue, secretComment, metadata, decryptErrs := DecryptSecretFields(foundSecret, cipherPair, false)
	if decryptErrs.ValueErr != nil {
		return nil, errutil.InternalServer("Failed to decrypt secret value").WithErrf("GetSecretByName(secretId=%s): %w", foundSecret.ID, decryptErrs.ValueErr)
	}
	if decryptErrs.CommentErr != nil || decryptErrs.MetadataErr != nil {
		s.logger.WarnContext(ctx, "non-critical decryption errors",
			slog.String("secretId", foundSecret.ID.String()),
			slog.Any("commentErr", decryptErrs.CommentErr),
			slog.Any("metadataErr", decryptErrs.MetadataErr))
	}

	return &GetSecretByNameResult{
		Secret: &ProcessedSecret{
			Secret:      foundSecret,
			SecretPath:  secretPath,
			Environment: secretEnv,
			RawValue:    rawValue,
			Value:       displayValue,
			Comment:     secretComment,
			Metadata:    metadata,
			ValueHidden: false,
		},
		FolderLookup: folderLookup,
		CipherPair:   cipherPair,
		Imports:      allImports,
		FolderID:     folderNode.ID,
	}, nil
}
