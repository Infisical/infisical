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
// Returns all matching secrets - permission filtering should happen in the caller.
func (s *Service) FetchAbsoluteSecrets(ctx context.Context, refs []AbsoluteSecretRef, opts AbsoluteFetchOpts) []*ProcessedSecret {
	if len(refs) == 0 {
		return nil
	}

	// Build location map
	type locationKey struct {
		envID uuid.UUID
		path  string
	}

	locationToKeys := make(map[locationKey]map[string]struct{})

	for i := range refs {
		ref := &refs[i]
		envID, ok := opts.FolderLookup.GetEnvIDBySlug(ref.Env)
		if !ok {
			continue
		}

		key := locationKey{envID: envID, path: ref.Path}
		if locationToKeys[key] == nil {
			locationToKeys[key] = make(map[string]struct{})
		}
		locationToKeys[key][ref.Key] = struct{}{}
	}

	var folderIDs []uuid.UUID
	folderToLocation := make(map[uuid.UUID]locationKey)

	for loc := range locationToKeys {
		node, ok := opts.FolderLookup.GetByPath(loc.envID, loc.path)
		if !ok {
			continue
		}
		folderIDs = append(folderIDs, node.ID)
		folderToLocation[node.ID] = loc
	}

	if len(folderIDs) == 0 {
		return nil
	}

	rawSecrets, err := s.FindByFolderIds(ctx, folderIDs, opts.UserID, nil)
	if err != nil {
		return nil
	}

	var result []*ProcessedSecret
	for i := range rawSecrets {
		sec := &rawSecrets[i]
		loc, ok := folderToLocation[sec.FolderID]
		if !ok {
			continue
		}

		wantedKeys := locationToKeys[loc]
		if _, wanted := wantedKeys[sec.Key]; !wanted {
			continue
		}

		envSlug, _ := opts.FolderLookup.GetEnvSlug(loc.envID)

		rawValue, displayValue, comment, metadata, decryptErrs := DecryptSecretFields(sec, opts.CipherPair, false)
		if decryptErrs.HasErrors() {
			s.logger.WarnContext(ctx, "absolute ref decryption errors (fail-open)",
				slog.String("secretId", sec.ID.String()),
				slog.Any("valueErr", decryptErrs.ValueErr))
		}

		result = append(result, &ProcessedSecret{
			Secret:      sec,
			SecretPath:  loc.path,
			Environment: envSlug,
			RawValue:    rawValue,
			Value:       displayValue,
			Comment:     comment,
			Metadata:    metadata,
			ValueHidden: false,
		})
	}

	return result
}
