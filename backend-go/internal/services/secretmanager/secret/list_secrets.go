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

// AbsoluteFolderLookup is the folder hierarchy view needed to resolve referenced
// locations. It is the subset of *secretfolder.FolderLookup used by reference reads.
type AbsoluteFolderLookup interface {
	GetEnvIDBySlug(envSlug string) (uuid.UUID, bool)
	GetByPath(envID uuid.UUID, path string) (*secretfolder.FolderNode, bool)
	GetEnvSlug(envID uuid.UUID) (string, bool)
}

// AbsoluteFetchOpts contains options for fetching absolute secret references.
type AbsoluteFetchOpts struct {
	ProjectID    string
	FolderLookup AbsoluteFolderLookup
	CipherPair   *kms.CipherPair
	UserID       *uuid.UUID
}

// absoluteFetchLocation identifies an environment/path holding referenced values.
type absoluteFetchLocation struct {
	env  string
	path string
}

// absoluteFetchTarget is a referenced location resolved to its folder, along with
// the keys wanted from it.
type absoluteFetchTarget struct {
	location absoluteFetchLocation
	folderID uuid.UUID
	wanted   map[string]struct{}
}

// absoluteFetchMatch is a wanted key resolved to a secret, before decryption.
type absoluteFetchMatch struct {
	secret     *Secret
	location   absoluteFetchLocation
	imported   bool
	importEnv  string
	importPath string
}

// importChainResolver resolves the folders reachable through a folder's imports.
type importChainResolver interface {
	ResolveChain(startFolderID uuid.UUID, resolveFolder func(envID uuid.UUID, path string) (uuid.UUID, bool)) []secretimport.ResolvedImport
}

// absoluteSecretReader loads the raw records needed to resolve absolute references.
// *Service implements it; tests substitute a fake to verify reference reads batch.
type absoluteSecretReader interface {
	FindByFolderIds(ctx context.Context, folderIDs []uuid.UUID, userID *uuid.UUID, filters *FindByFolderIdsFilter) ([]Secret, error)
	LoadProjectImports(ctx context.Context, projectID string) (*secretimport.ImportLookup, error)
}

var _ absoluteSecretReader = (*Service)(nil)

// FetchAbsoluteSecrets retrieves the values for absolute references, including
// values a referenced location inherits through imports. The caller supplies the
// folder hierarchy and cipher pair so this read reuses them instead of reloading
// folders or asking KMS for another project data key. Reads are batched: one query
// for every requested folder, and at most one more for the import folders reached
// by keys that are not defined directly.
//
// A fetched value expands in the explicitly referenced environment/path (its
// imports included), so an equivalent reference chain resolves to the same value
// however it is nested. Imported values are exposed under the requested location
// and keep their origin in ImportEnvironment/ImportPath, which the caller checks
// access against.
func (s *Service) FetchAbsoluteSecrets(ctx context.Context, refs []AbsoluteSecretRef, opts AbsoluteFetchOpts) []*ProcessedSecret {
	return fetchAbsoluteSecrets(ctx, s.logger, s, refs, opts)
}

func fetchAbsoluteSecrets(ctx context.Context, logger *slog.Logger, reader absoluteSecretReader, refs []AbsoluteSecretRef, opts AbsoluteFetchOpts) []*ProcessedSecret {
	targets := absoluteFetchTargets(refs, opts.FolderLookup)
	if len(targets) == 0 {
		return nil
	}

	folderIDs := make([]uuid.UUID, 0, len(targets))
	seenFolderIDs := make(map[uuid.UUID]struct{}, len(targets))
	for _, target := range targets {
		if _, seen := seenFolderIDs[target.folderID]; seen {
			continue
		}
		seenFolderIDs[target.folderID] = struct{}{}
		folderIDs = append(folderIDs, target.folderID)
	}

	directSecrets, err := reader.FindByFolderIds(ctx, folderIDs, opts.UserID, nil)
	if err != nil {
		return nil
	}

	secretsByFolder := groupSecretsByFolder(directSecrets)
	found := make([]map[string]struct{}, len(targets))
	var matches []absoluteFetchMatch
	var missing []int
	for i := range targets {
		target := &targets[i]
		found[i] = make(map[string]struct{}, len(target.wanted))
		for _, sec := range secretsByFolder[target.folderID] {
			if _, wanted := target.wanted[sec.Key]; !wanted {
				continue
			}
			if _, duplicate := found[i][sec.Key]; duplicate {
				continue
			}
			found[i][sec.Key] = struct{}{}
			matches = append(matches, absoluteFetchMatch{secret: sec, location: target.location})
		}
		if len(found[i]) < len(target.wanted) {
			missing = append(missing, i)
		}
	}

	if len(missing) > 0 {
		matches = appendImportedAbsoluteFetchSecrets(ctx, reader, opts, targets, missing, found, matches)
	}

	return decryptAbsoluteFetchMatches(ctx, logger, matches, opts.CipherPair)
}

// appendImportedAbsoluteFetchSecrets resolves keys that are not defined directly in
// a referenced location through that location's import chain. Project imports are
// loaded once and the import folders for every location are read in one batch.
func appendImportedAbsoluteFetchSecrets(
	ctx context.Context,
	reader absoluteSecretReader,
	opts AbsoluteFetchOpts,
	targets []absoluteFetchTarget,
	missing []int,
	found []map[string]struct{},
	matches []absoluteFetchMatch,
) []absoluteFetchMatch {
	importLookup, err := reader.LoadProjectImports(ctx, opts.ProjectID)
	if err != nil || importLookup == nil {
		return matches
	}

	chains, folderIDs := absoluteImportReadPlan(targets, missing, importLookup, opts.FolderLookup)
	if len(folderIDs) == 0 {
		return matches
	}

	importedSecrets, err := reader.FindByFolderIds(ctx, folderIDs, opts.UserID, nil)
	if err != nil {
		return matches
	}

	return matchImportedAbsoluteFetchSecrets(targets, missing, chains, groupSecretsByFolder(importedSecrets), opts.FolderLookup, found, matches)
}

// absoluteFetchTargets resolves requested locations to folders using the supplied
// lookup and groups the requested keys by location. Unknown locations are skipped.
func absoluteFetchTargets(refs []AbsoluteSecretRef, folderLookup AbsoluteFolderLookup) []absoluteFetchTarget {
	targets := make([]absoluteFetchTarget, 0, len(refs))
	targetIndexByLocation := make(map[absoluteFetchLocation]int, len(refs))
	for _, ref := range refs {
		location := absoluteFetchLocation{env: ref.Env, path: ref.Path}
		if idx, ok := targetIndexByLocation[location]; ok {
			targets[idx].wanted[ref.Key] = struct{}{}
			continue
		}

		envID, ok := folderLookup.GetEnvIDBySlug(ref.Env)
		if !ok {
			continue
		}
		node, ok := folderLookup.GetByPath(envID, ref.Path)
		if !ok {
			continue
		}

		targetIndexByLocation[location] = len(targets)
		targets = append(targets, absoluteFetchTarget{
			location: location,
			folderID: node.ID,
			wanted:   map[string]struct{}{ref.Key: {}},
		})
	}
	return targets
}

// absoluteImportReadPlan resolves the import chain of every target that still has
// unresolved keys and returns the unique source folders to read.
func absoluteImportReadPlan(
	targets []absoluteFetchTarget,
	missing []int,
	resolver importChainResolver,
	folderLookup AbsoluteFolderLookup,
) (map[int][]secretimport.ResolvedImport, []uuid.UUID) {
	resolveFolder := func(envID uuid.UUID, path string) (uuid.UUID, bool) {
		node, ok := folderLookup.GetByPath(envID, path)
		if !ok {
			return uuid.Nil, false
		}
		return node.ID, true
	}

	chains := make(map[int][]secretimport.ResolvedImport, len(missing))
	folderIDs := make([]uuid.UUID, 0, len(missing))
	seenFolderIDs := make(map[uuid.UUID]struct{}, len(missing))
	for _, idx := range missing {
		chains[idx] = resolver.ResolveChain(targets[idx].folderID, resolveFolder)
		for i := len(chains[idx]) - 1; i >= 0; i-- {
			folderID := chains[idx][i].FolderID
			if _, seen := seenFolderIDs[folderID]; seen {
				continue
			}
			seenFolderIDs[folderID] = struct{}{}
			folderIDs = append(folderIDs, folderID)
		}
	}
	return chains, folderIDs
}

// matchImportedAbsoluteFetchSecrets resolves the remaining keys per target against
// the import folders read for them. Imports are consulted in reverse resolution
// order, which is the priority order used by ListSecretsResult.AllSecrets.
func matchImportedAbsoluteFetchSecrets(
	targets []absoluteFetchTarget,
	missing []int,
	chains map[int][]secretimport.ResolvedImport,
	secretsByFolder map[uuid.UUID][]*Secret,
	folderLookup AbsoluteFolderLookup,
	found []map[string]struct{},
	matches []absoluteFetchMatch,
) []absoluteFetchMatch {
	for _, idx := range missing {
		target := &targets[idx]
		for i := len(chains[idx]) - 1; i >= 0; i-- {
			imp := chains[idx][i]
			for _, sec := range secretsByFolder[imp.FolderID] {
				if _, wanted := target.wanted[sec.Key]; !wanted {
					continue
				}
				if _, duplicate := found[idx][sec.Key]; duplicate {
					continue
				}
				found[idx][sec.Key] = struct{}{}
				importEnv, _ := folderLookup.GetEnvSlug(imp.EnvID)
				matches = append(matches, absoluteFetchMatch{
					secret:     sec,
					location:   target.location,
					imported:   true,
					importEnv:  importEnv,
					importPath: imp.Path,
				})
			}
		}
	}
	return matches
}

// decryptAbsoluteFetchMatches decrypts the matched secrets with the caller's cipher
// pair and exposes every match under the location it was requested from.
func decryptAbsoluteFetchMatches(ctx context.Context, logger *slog.Logger, matches []absoluteFetchMatch, cipherPair *kms.CipherPair) []*ProcessedSecret {
	result := make([]*ProcessedSecret, 0, len(matches))
	for _, match := range matches {
		rawValue, displayValue, secretComment, metadata, decryptErrs := DecryptSecretFields(match.secret, cipherPair, false)
		if decryptErrs.HasErrors() {
			logger.WarnContext(ctx, "absolute ref decryption errors (fail-open)",
				slog.String("secretId", match.secret.ID.String()),
				slog.Any("valueErr", decryptErrs.ValueErr))
		}

		result = append(result, &ProcessedSecret{
			Secret:            match.secret,
			SecretPath:        match.location.path,
			Environment:       match.location.env,
			RawValue:          rawValue,
			Value:             displayValue,
			Comment:           secretComment,
			Metadata:          metadata,
			IsImported:        match.imported,
			ImportEnvironment: match.importEnv,
			ImportPath:        match.importPath,
		})
	}
	return result
}

// groupSecretsByFolder groups raw secrets by their folder, preserving read order.
func groupSecretsByFolder(secrets []Secret) map[uuid.UUID][]*Secret {
	grouped := make(map[uuid.UUID][]*Secret, len(secrets))
	for i := range secrets {
		sec := &secrets[i]
		grouped[sec.FolderID] = append(grouped[sec.FolderID], sec)
	}
	return grouped
}
