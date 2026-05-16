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

// PersonalOverridesBehavior controls how personal secret overrides are handled.
type PersonalOverridesBehavior int

const (
	// PersonalOverridesIncludeAll returns both shared and personal secrets (v3 behavior).
	PersonalOverridesIncludeAll PersonalOverridesBehavior = iota
	// PersonalOverridesNeverInclude returns only shared secrets.
	PersonalOverridesNeverInclude
	// PersonalOverridesPriority returns personal secrets when they exist, otherwise shared (v4 with flag).
	PersonalOverridesPriority
)

// ListSecretsOpts contains options for listing secrets.
// Note: Imports are always loaded and included in the result.
type ListSecretsOpts struct {
	ProjectID                        string
	Environment                      string
	SecretPath                       string
	UserID                           *uuid.UUID
	ViewSecretValue                  bool
	ExpandSecretReferences           bool
	Recursive                        bool
	PersonalOverridesBehavior        PersonalOverridesBehavior
	ExpandPersonalOverrides          bool
	TagSlugs                         []string
	MetadataFilter                   []MetadataFilter
	Access                           AccessControl
	ThrowOnMissingReadValuePermission bool
}

// ListSecretsResult contains the results of listing secrets.
type ListSecretsResult struct {
	DirectSecrets   []ProcessedSecret
	ImportedSecrets []ProcessedSecret
	Imports         []secretimport.ResolvedImport
	FolderLookup    *secretfolder.FolderLookup
}

// ListSecrets retrieves secrets for a project/environment/path with full processing.
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

	// Resolve import chain using folder lookup
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

	cipherPair, err := s.kmsService.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("ListSecrets: %w", err)
	}

	directSecrets, importedSecrets, err := s.processSecretsWithPermissions(
		ctx,
		secrets,
		directFolderIDs,
		directPaths,
		allImports,
		opts.Environment,
		folderLookup,
		importLookup,
		secretProcessorOpts{
			ViewSecretValue:                   opts.ViewSecretValue,
			Access:                            opts.Access,
			CipherPair:                        cipherPair,
			RequestedPath:                     opts.SecretPath,
			Recursive:                         opts.Recursive,
			ThrowOnMissingReadValuePermission: opts.ThrowOnMissingReadValuePermission,
		},
	)
	if err != nil {
		return nil, err
	}

	directSecrets = filterByPersonalOverridesBehavior(directSecrets, opts.PersonalOverridesBehavior)
	importedSecrets = filterByPersonalOverridesBehavior(importedSecrets, opts.PersonalOverridesBehavior)

	if opts.ExpandSecretReferences {
		// Build expansion list: direct secrets first, then imported in reverse import order
		allSecrets := buildExpansionSecretList(directSecrets, importedSecrets, allImports)

		var expansionUserID *uuid.UUID
		if opts.ExpandPersonalOverrides &&
			(opts.PersonalOverridesBehavior == PersonalOverridesPriority ||
				opts.PersonalOverridesBehavior == PersonalOverridesIncludeAll) {
			expansionUserID = opts.UserID
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
					userID:       expansionUserID,
				})
			},
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("ListSecrets: denied refs: %v", expander.DeniedRefs())
		}
	}

	return &ListSecretsResult{
		DirectSecrets:   directSecrets,
		ImportedSecrets: importedSecrets,
		Imports:         allImports,
		FolderLookup:    folderLookup,
	}, nil
}

// secretProcessorOpts configures secret processing.
type secretProcessorOpts struct {
	ViewSecretValue                   bool
	Access                            AccessControl
	CipherPair                        *kms.CipherPair
	RequestedPath                     string
	Recursive                         bool
	ThrowOnMissingReadValuePermission bool
}

// processSecretsWithPermissions filters and decrypts secrets based on permissions.
func (s *Service) processSecretsWithPermissions(
	ctx context.Context,
	rawSecrets []Secret,
	directFolderIDs []uuid.UUID,
	directPaths map[uuid.UUID]string,
	imports []secretimport.ResolvedImport,
	requestedEnv string,
	folderLookup *secretfolder.FolderLookup,
	importLookup *secretimport.ImportLookup,
	opts secretProcessorOpts,
) (directSecrets, importedSecrets []ProcessedSecret, err error) {
	directFolderSet := make(map[uuid.UUID]bool, len(directFolderIDs))
	for _, id := range directFolderIDs {
		directFolderSet[id] = true
	}

	importByFolderID := make(map[uuid.UUID]*secretimport.ResolvedImport, len(imports))
	for i := range imports {
		importByFolderID[imports[i].FolderID] = &imports[i]
	}

	for i := range rawSecrets {
		sec := &rawSecrets[i]
		var secretPath, envSlug string
		var isImported bool
		var importFolderID uuid.UUID
		var importEnv, importPath string

		if directFolderSet[sec.FolderID] {
			secretPath = directPaths[sec.FolderID]
			envSlug = requestedEnv
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

		tagSlugs := make([]string, len(sec.Tags))
		for j, tag := range sec.Tags {
			tagSlugs[j] = tag.Slug
		}

		// Permission checks
		if !opts.Access.CanDescribe(envSlug, secretPath, sec.Key, tagSlugs) {
			continue
		}

		canReadValue := opts.Access.CanReadValue(envSlug, secretPath, sec.Key, tagSlugs)

		if opts.Recursive && opts.ViewSecretValue && secretPath != opts.RequestedPath {
			if !canReadValue {
				continue
			}
		}

		if opts.ThrowOnMissingReadValuePermission && opts.ViewSecretValue && !canReadValue {
			return nil, nil, errutil.Forbidden("Missing read value permission for secret %s", sec.Key)
		}

		valueHidden := !opts.ViewSecretValue || !canReadValue
		rawValue, displayValue, secretComment, metadata, decryptErrs := decryptSecretFields(sec, opts.CipherPair, valueHidden)
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
			ValueHidden:       valueHidden,
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

	return directSecrets, importedSecrets, nil
}

// filterByPersonalOverridesBehavior filters secrets based on personal overrides behavior.
func filterByPersonalOverridesBehavior(secretsList []ProcessedSecret, behavior PersonalOverridesBehavior) []ProcessedSecret {
	switch behavior {
	case PersonalOverridesIncludeAll:
		return secretsList

	case PersonalOverridesNeverInclude:
		result := make([]ProcessedSecret, 0, len(secretsList))
		for i := range secretsList {
			if secretsList[i].Secret.Type == "shared" {
				result = append(result, secretsList[i])
			}
		}
		return result

	case PersonalOverridesPriority:
		secretMap := make(map[string]*ProcessedSecret, len(secretsList))
		for i := range secretsList {
			sec := &secretsList[i]
			key := sec.Secret.Key + "-" + sec.Secret.FolderID.String()
			if existing, exists := secretMap[key]; !exists || sec.Secret.Type == "personal" && existing.Secret.Type != "personal" {
				secretMap[key] = sec
			}
		}
		result := make([]ProcessedSecret, 0, len(secretMap))
		for _, sec := range secretMap {
			result = append(result, *sec)
		}
		return result

	default:
		return secretsList
	}
}

// buildExpansionSecretList builds a priority-ordered list for expansion.
// Direct secrets come first, then imported secrets in reverse import order.
// First occurrence of each key wins for relative reference resolution.
func buildExpansionSecretList(
	directSecrets []ProcessedSecret,
	importedSecrets []ProcessedSecret,
	imports []secretimport.ResolvedImport,
) []*ProcessedSecret {
	result := make([]*ProcessedSecret, 0, len(directSecrets)+len(importedSecrets))

	// Direct secrets first (highest priority)
	for i := range directSecrets {
		result = append(result, &directSecrets[i])
	}

	// Group imported secrets by folder for ordering
	importedByFolderID := make(map[uuid.UUID][]*ProcessedSecret, len(imports))
	for i := range importedSecrets {
		sec := &importedSecrets[i]
		importedByFolderID[sec.Secret.FolderID] = append(importedByFolderID[sec.Secret.FolderID], sec)
	}

	// Imported secrets in reverse import order (later imports have higher priority)
	for i := len(imports) - 1; i >= 0; i-- {
		result = append(result, importedByFolderID[imports[i].FolderID]...)
	}

	return result
}

// absoluteFetchOpts contains options for fetching absolute secret references.
type absoluteFetchOpts struct {
	projectID    string
	folderLookup *secretfolder.FolderLookup
	cipherPair   *kms.CipherPair
	userID       *uuid.UUID
}

// fetchAbsoluteSecrets retrieves secrets for the given absolute references.
func (s *Service) fetchAbsoluteSecrets(ctx context.Context, refs []AbsoluteSecretRef, opts absoluteFetchOpts) []*ProcessedSecret {
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
		envID, ok := opts.folderLookup.GetEnvIDBySlug(ref.Env)
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
		node, ok := opts.folderLookup.GetByPath(loc.envID, loc.path)
		if !ok {
			continue
		}
		folderIDs = append(folderIDs, node.ID)
		folderToLocation[node.ID] = loc
	}

	if len(folderIDs) == 0 {
		return nil
	}

	rawSecrets, err := s.FindByFolderIds(ctx, folderIDs, opts.userID, nil)
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

		envSlug, _ := opts.folderLookup.GetEnvSlug(loc.envID)
		rawValue, displayValue, comment, metadata, decryptErrs := decryptSecretFields(sec, opts.cipherPair, false)
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
