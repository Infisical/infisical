package secret

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

// ListSecretsOpts contains options for listing secrets.
// The service is permission-agnostic - all filtering happens in the handler.
type ListSecretsOpts struct {
	ProjectID      string
	Environment    string
	SecretPath     string
	UserID         *uuid.UUID // For personal secrets lookup
	Recursive      bool
	TagSlugs       []string
	MetadataFilter []MetadataFilter
}

// ListSecretsResult contains the results of listing secrets.
type ListSecretsResult struct {
	DirectSecrets   []ProcessedSecret
	ImportedSecrets []ProcessedSecret
	Imports         []secretimport.ResolvedImport
	FolderLookup    *secretfolder.FolderLookup
	CipherPair      *kms.CipherPair // Exposed for handler to use in expansion
}

// AllSecrets returns all secrets (direct + imported) in priority order for expansion.
// Direct secrets first, then imported in reverse import order (later imports win).
func (r *ListSecretsResult) AllSecrets() []*ProcessedSecret {
	result := make([]*ProcessedSecret, 0, len(r.DirectSecrets)+len(r.ImportedSecrets))

	for i := range r.DirectSecrets {
		result = append(result, &r.DirectSecrets[i])
	}

	importedByFolderID := make(map[uuid.UUID][]*ProcessedSecret, len(r.Imports))
	for i := range r.ImportedSecrets {
		sec := &r.ImportedSecrets[i]
		importedByFolderID[sec.Secret.FolderID] = append(importedByFolderID[sec.Secret.FolderID], sec)
	}

	for i := len(r.Imports) - 1; i >= 0; i-- {
		result = append(result, importedByFolderID[r.Imports[i].FolderID]...)
	}

	return result
}

// ListSecrets retrieves secrets for a project/environment/path.
// This is permission-agnostic - returns ALL secrets. Handler filters by permission.
func (s *Service) ListSecrets(ctx context.Context, opts *ListSecretsOpts) (*ListSecretsResult, error) {
	folderLookup, err := s.secretFolderService.LoadFolders(ctx, opts.ProjectID, nil)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("ListSecrets: %w", err)
	}

	envID, ok := folderLookup.GetEnvIDBySlug(opts.Environment)
	if !ok {
		return nil, errutil.NotFound("Environment not found")
	}

	var directFolderIDs []uuid.UUID
	directPaths := make(map[uuid.UUID]string)

	if opts.Recursive {
		nodes, ok := folderLookup.GetSubTree(envID, opts.SecretPath)
		if !ok || len(nodes) == 0 {
			return nil, errutil.NotFound("Folder not found").WithErrf("ListSecrets: path=%s", opts.SecretPath)
		}
		for _, node := range nodes {
			directFolderIDs = append(directFolderIDs, node.ID)
			directPaths[node.ID] = node.GetPath()
		}
	} else {
		node, ok := folderLookup.GetByPath(envID, opts.SecretPath)
		if !ok {
			return nil, errutil.NotFound("Folder not found").WithErrf("ListSecrets: path=%s", opts.SecretPath)
		}
		directFolderIDs = []uuid.UUID{node.ID}
		directPaths[node.ID] = opts.SecretPath
	}

	importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("ListSecrets: %w", err)
	}

	resolveFolder := func(envID uuid.UUID, path string) (uuid.UUID, bool) {
		node, ok := folderLookup.GetByPath(envID, path)
		if !ok {
			return uuid.Nil, false
		}
		return node.ID, true
	}

	var allImports []secretimport.ResolvedImport
	visitedImports := make(map[uuid.UUID]bool)
	for _, folderID := range directFolderIDs {
		imports := importLookup.ResolveChain(folderID, resolveFolder)
		for _, imp := range imports {
			if !visitedImports[imp.FolderID] {
				visitedImports[imp.FolderID] = true
				allImports = append(allImports, imp)
			}
		}
	}

	allFolderIDs := make([]uuid.UUID, 0, len(directFolderIDs)+len(allImports))
	allFolderIDs = append(allFolderIDs, directFolderIDs...)
	for _, imp := range allImports {
		allFolderIDs = append(allFolderIDs, imp.FolderID)
	}

	var dalFilters *FindByFolderIdsFilter
	if len(opts.TagSlugs) > 0 || len(opts.MetadataFilter) > 0 {
		dalFilters = &FindByFolderIdsFilter{
			TagSlugs:       opts.TagSlugs,
			MetadataFilter: opts.MetadataFilter,
		}
	}

	secrets, err := s.FindByFolderIds(ctx, allFolderIDs, opts.UserID, dalFilters)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load secrets").WithErrf("ListSecrets: %w", err)
	}

	cipherPair, err := s.kmsService.CreateCipherPairWithProjectDataKey(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("ListSecrets: %w", err)
	}

	// Process secrets: decrypt and categorize as direct or imported
	directFolderSet := make(map[uuid.UUID]bool, len(directFolderIDs))
	for _, id := range directFolderIDs {
		directFolderSet[id] = true
	}

	importByFolderID := make(map[uuid.UUID]*secretimport.ResolvedImport, len(allImports))
	for i := range allImports {
		importByFolderID[allImports[i].FolderID] = &allImports[i]
	}

	var directSecrets, importedSecrets []ProcessedSecret

	for i := range secrets {
		sec := &secrets[i]
		var secretPath, envSlug string
		var isImported bool
		var importFolderID uuid.UUID
		var importEnv, importPath string

		if directFolderSet[sec.FolderID] {
			secretPath = directPaths[sec.FolderID]
			envSlug = opts.Environment
			isImported = false
		} else if imp, ok := importByFolderID[sec.FolderID]; ok {
			secretPath = imp.Path
			envSlug, _ = folderLookup.GetEnvSlug(imp.EnvID)
			isImported = true
			importFolderID = importLookup.FolderID(imp.ImportIdx)
			importEnv = envSlug
			importPath = imp.Path
		} else {
			continue
		}

		rawValue, displayValue, secretComment, metadata, decryptErrs := DecryptSecretFields(sec, cipherPair, false)
		if decryptErrs.HasErrors() {
			s.logger.WarnContext(ctx, "secret decryption errors (fail-open)",
				slog.String("secretId", sec.ID.String()),
				slog.Any("valueErr", decryptErrs.ValueErr))
		}

		processed := ProcessedSecret{
			Secret:            sec,
			SecretPath:        secretPath,
			Environment:       envSlug,
			RawValue:          rawValue,
			Value:             displayValue,
			Comment:           secretComment,
			Metadata:          metadata,
			ValueHidden:       false,
			IsImported:        isImported,
			ImportFolderID:    importFolderID,
			ImportEnvironment: importEnv,
			ImportPath:        importPath,
		}

		if isImported {
			importedSecrets = append(importedSecrets, processed)
		} else {
			directSecrets = append(directSecrets, processed)
		}
	}

	return &ListSecretsResult{
		DirectSecrets:   directSecrets,
		ImportedSecrets: importedSecrets,
		Imports:         allImports,
		FolderLookup:    folderLookup,
		CipherPair:      cipherPair,
	}, nil
}

// AbsoluteFetchOpts contains options for fetching absolute secret references.
type AbsoluteFetchOpts struct {
	ProjectID    string
	FolderLookup *secretfolder.FolderLookup
	CipherPair   *kms.CipherPair
	UserID       *uuid.UUID
}

// FetchAbsoluteSecrets retrieves secrets for the given absolute references.
// Relative references inside a fetched value resolve in that value's own board,
// so the folder's imports are included: direct secrets take precedence, then
// imports in reverse import order (matching ListSecrets). Imported values are
// exposed under the requested location and keep their origin in
// ImportEnvironment/ImportPath for nested-relative resolution.
func (s *Service) FetchAbsoluteSecrets(ctx context.Context, refs []AbsoluteSecretRef, opts AbsoluteFetchOpts) []*ProcessedSecret {
	if len(refs) == 0 {
		return nil
	}

	type location struct {
		env  string
		path string
	}

	wanted := make(map[location]map[string]struct{})
	var order []location
	for _, ref := range refs {
		loc := location{env: ref.Env, path: ref.Path}
		if wanted[loc] == nil {
			wanted[loc] = make(map[string]struct{})
			order = append(order, loc)
		}
		wanted[loc][ref.Key] = struct{}{}
	}

	var result []*ProcessedSecret
	for _, loc := range order {
		list, err := s.ListSecrets(ctx, &ListSecretsOpts{
			ProjectID:   opts.ProjectID,
			Environment: loc.env,
			SecretPath:  loc.path,
			UserID:      opts.UserID,
		})
		if err != nil {
			continue
		}

		seen := make(map[string]struct{})
		for _, sec := range list.AllSecrets() {
			if _, ok := wanted[loc][sec.Secret.Key]; !ok {
				continue
			}
			if _, dup := seen[sec.Secret.Key]; dup {
				continue
			}
			seen[sec.Secret.Key] = struct{}{}

			if sec.IsImported {
				originEnv, originPath := sec.Environment, sec.SecretPath
				sec.Environment = loc.env
				sec.SecretPath = loc.path
				sec.ImportEnvironment = originEnv
				sec.ImportPath = originPath
			}

			result = append(result, sec)
		}
	}

	return result
}
