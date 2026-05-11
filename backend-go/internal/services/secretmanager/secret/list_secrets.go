package secret

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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

// MetadataFilterEntry represents a single key-value filter for metadata.
type MetadataFilterEntry struct {
	Key   string
	Value string
}

// ListSecretsOpts contains options for listing secrets.
type ListSecretsOpts struct {
	ProjectID                 string
	Environment               string
	SecretPath                string
	UserID                    *uuid.UUID
	ViewSecretValue           bool
	ExpandSecretReferences    bool
	Recursive                 bool
	IncludeImports            bool
	PersonalOverridesBehavior PersonalOverridesBehavior
	ExpandPersonalOverrides   bool
	TagSlugs                  []string
	MetadataFilter            []MetadataFilterEntry
	AccessChecker             AccessChecker // nil = skip permission checks
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
	// 1. Get starting environment by slug
	envID, err := s.getEnvBySlug(ctx, opts.ProjectID, opts.Environment)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errutil.NotFound("Environment not found")
		}
		return nil, errutil.DatabaseErr("Failed to load environment").WithErrf("ListSecrets: %w", err)
	}

	// 2. Load imports
	importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load imports").WithErrf("ListSecrets: %w", err)
	}

	// 3. Resolve folder chain (lazy-loads folders for imported envs)
	chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderService)
	chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, envID, opts.SecretPath, opts.Recursive)
	if err != nil {
		return nil, errutil.NotFound("Folder not found").WithErrf("ListSecrets: %w", err)
	}

	// 4. Fetch secrets from all folders
	allFolderIDs := chainResult.AllFolderIDs()

	var dalFilters *FindByFolderIdsFilter
	if len(opts.TagSlugs) > 0 || len(opts.MetadataFilter) > 0 {
		dalFilters = &FindByFolderIdsFilter{}
		if len(opts.TagSlugs) > 0 {
			dalFilters.TagSlugs = opts.TagSlugs
		}
		if len(opts.MetadataFilter) > 0 {
			dalFilters.MetadataFilter = make([]MetadataFilter, len(opts.MetadataFilter))
			for i, mf := range opts.MetadataFilter {
				dalFilters.MetadataFilter[i] = MetadataFilter(mf)
			}
		}
	}

	secrets, err := s.FindByFolderIds(ctx, allFolderIDs, opts.UserID, dalFilters)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("ListSecrets: %w", err)
	}

	// 5. Get cipher pair for decryption
	cipherPair, err := s.kmsService.CreateCipherPairWithDataKey(ctx, kms.CreateCipherPairDTO{
		Type:      kms.DataKeyProject,
		ProjectID: opts.ProjectID,
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to get decryption key").WithErrf("ListSecrets: %w", err)
	}

	// 6. Process secrets with permission filtering
	directSecrets, importedSecrets := s.processSecretsWithPermissions(
		secrets,
		chainResult.DirectFolderIDs,
		chainResult.DirectPaths,
		chainResult.Imports,
		opts.Environment,
		chainResult.FolderLookup,
		secretProcessorOpts{
			ViewSecretValue: opts.ViewSecretValue,
			AccessChecker:   opts.AccessChecker,
			CipherPair:      cipherPair,
			RequestedPath:   opts.SecretPath,
			Recursive:       opts.Recursive,
		},
	)

	// 7. Apply personal overrides behavior
	directSecrets = filterByPersonalOverridesBehavior(directSecrets, opts.PersonalOverridesBehavior)
	importedSecrets = filterByPersonalOverridesBehavior(importedSecrets, opts.PersonalOverridesBehavior)

	// 8. Expand secret references if requested
	if opts.ExpandSecretReferences {
		inputs := buildSecretInputsForExpansion(directSecrets, importedSecrets, chainResult.Imports)

		var expansionUserID *uuid.UUID
		if opts.ExpandPersonalOverrides &&
			(opts.PersonalOverridesBehavior == PersonalOverridesPriority ||
				opts.PersonalOverridesBehavior == PersonalOverridesIncludeAll) {
			expansionUserID = opts.UserID
		}

		expander := NewSecretExpander(inputs, ExpandOpts{
			CanAccessAbsolute: func(ref AbsoluteSecretRef) bool {
				if opts.AccessChecker == nil {
					return true
				}
				return opts.AccessChecker.CanReadSecretValue(ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: func(refs []AbsoluteSecretRef) []SecretInput {
				return s.fetchAbsoluteSecrets(ctx, refs, absoluteFetchOpts{
					projectID:    opts.ProjectID,
					folderLookup: chainResult.FolderLookup,
					cipherPair:   cipherPair,
					userID:       expansionUserID,
				})
			},
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("ListSecrets: denied refs: %v", expander.DeniedRefs())
		}

		applyExpandedValues(directSecrets, importedSecrets, expander)
	}

	return &ListSecretsResult{
		DirectSecrets:   directSecrets,
		ImportedSecrets: importedSecrets,
		Imports:         chainResult.Imports,
		FolderLookup:    chainResult.FolderLookup,
	}, nil
}

// secretProcessorOpts configures secret processing.
type secretProcessorOpts struct {
	ViewSecretValue bool
	AccessChecker   AccessChecker
	CipherPair      *kms.CipherPair
	RequestedPath   string
	Recursive       bool
}

// processSecretsWithPermissions filters and decrypts secrets based on permissions.
func (s *Service) processSecretsWithPermissions(
	rawSecrets []Secret,
	directFolderIDs []uuid.UUID,
	directPaths map[uuid.UUID]string,
	imports []secretimport.ResolvedImport,
	requestedEnv string,
	folderLookup *secretfolder.FolderLookup,
	opts secretProcessorOpts,
) (directSecrets, importedSecrets []ProcessedSecret) {
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
			importFolderID = imp.Import.FolderID
			importEnv = envSlug
			importPath = imp.Path
		} else {
			continue
		}

		tagSlugs := make([]string, len(sec.Tags))
		for j, tag := range sec.Tags {
			tagSlugs[j] = tag.Slug
		}

		// Permission checks (skip if no checker)
		if opts.AccessChecker != nil {
			canDescribe := opts.AccessChecker.CanDescribeSecret(envSlug, secretPath, sec.Key, tagSlugs)
			if !canDescribe {
				continue
			}
		}

		canReadValue := true
		if opts.AccessChecker != nil {
			canReadValue = opts.AccessChecker.CanReadSecretValue(envSlug, secretPath, sec.Key, tagSlugs)
		}

		if opts.Recursive && opts.ViewSecretValue && secretPath != opts.RequestedPath {
			if !canReadValue {
				continue
			}
		}

		valueHidden := !opts.ViewSecretValue || !canReadValue

		var secretValue, secretComment string
		if !valueHidden && sec.EncryptedValue.Valid && len(sec.EncryptedValue.V) > 0 {
			if decrypted, err := opts.CipherPair.Decrypt(sec.EncryptedValue.V); err == nil {
				secretValue = string(decrypted)
			}
		}
		if valueHidden {
			secretValue = secretValueHiddenMask
		}

		if sec.EncryptedComment.Valid && len(sec.EncryptedComment.V) > 0 {
			if decrypted, err := opts.CipherPair.Decrypt(sec.EncryptedComment.V); err == nil {
				secretComment = string(decrypted)
			}
		}

		var metadata []DecryptedMetadata
		for _, m := range sec.SecretMetadata {
			value := m.Value
			if len(m.EncryptedValue) > 0 {
				if decrypted, err := opts.CipherPair.Decrypt(m.EncryptedValue); err == nil {
					value = string(decrypted)
				}
			}
			metadata = append(metadata, DecryptedMetadata{
				Key:   m.Key,
				Value: value,
			})
		}

		processed := ProcessedSecret{
			Secret:            sec,
			SecretPath:        secretPath,
			Environment:       envSlug,
			Value:             secretValue,
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

	return directSecrets, importedSecrets
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

// buildSecretInputsForExpansion builds SecretInput slice for the expander.
func buildSecretInputsForExpansion(
	directSecrets []ProcessedSecret,
	importedSecrets []ProcessedSecret,
	imports []secretimport.ResolvedImport,
) []SecretInput {
	inputs := make([]SecretInput, 0, len(directSecrets)+len(importedSecrets))

	for i := range directSecrets {
		sec := &directSecrets[i]
		if sec.ValueHidden {
			continue
		}
		inputs = append(inputs, SecretInput{
			ID:         sec.Secret.ID,
			Key:        sec.Secret.Key,
			Value:      sec.Value,
			Env:        sec.Environment,
			Path:       sec.SecretPath,
			IsImported: false,
		})
	}

	importedByFolderID := make(map[uuid.UUID][]*ProcessedSecret, len(imports))
	for i := range importedSecrets {
		sec := &importedSecrets[i]
		importedByFolderID[sec.Secret.FolderID] = append(importedByFolderID[sec.Secret.FolderID], sec)
	}

	// Iterate imports in reverse order
	for i := len(imports) - 1; i >= 0; i-- {
		imp := &imports[i]
		for _, sec := range importedByFolderID[imp.FolderID] {
			if sec.ValueHidden {
				continue
			}
			inputs = append(inputs, SecretInput{
				ID:         sec.Secret.ID,
				Key:        sec.Secret.Key,
				Value:      sec.Value,
				Env:        sec.Environment,
				Path:       sec.SecretPath,
				IsImported: true,
			})
		}
	}

	return inputs
}

// applyExpandedValues updates secret values from expander results.
func applyExpandedValues(
	directSecrets []ProcessedSecret,
	importedSecrets []ProcessedSecret,
	expander *SecretExpander,
) {
	for i := range directSecrets {
		if directSecrets[i].ValueHidden {
			continue
		}
		if expanded, ok := expander.LookUp(directSecrets[i].Secret.ID); ok {
			directSecrets[i].Value = expanded
		}
	}
	for i := range importedSecrets {
		if importedSecrets[i].ValueHidden {
			continue
		}
		if expanded, ok := expander.LookUp(importedSecrets[i].Secret.ID); ok {
			importedSecrets[i].Value = expanded
		}
	}
}

// absoluteFetchOpts contains options for fetching absolute secret references.
type absoluteFetchOpts struct {
	projectID    string
	folderLookup *secretfolder.FolderLookup
	cipherPair   *kms.CipherPair
	userID       *uuid.UUID
}

// fetchAbsoluteSecrets retrieves secrets for the given absolute references.
func (s *Service) fetchAbsoluteSecrets(ctx context.Context, refs []AbsoluteSecretRef, opts absoluteFetchOpts) []SecretInput {
	if len(refs) == 0 {
		return nil
	}

	// First pass: load envs that aren't in FolderLookup yet
	var newEnvIDs []uuid.UUID
	seenSlugs := make(map[string]bool)
	for i := range refs {
		slug := refs[i].Env
		if seenSlugs[slug] {
			continue
		}
		seenSlugs[slug] = true

		if _, ok := opts.folderLookup.GetEnvIDBySlug(slug); !ok {
			envID, err := s.getEnvBySlug(ctx, opts.projectID, slug)
			if err == nil {
				newEnvIDs = append(newEnvIDs, envID)
			}
		}
	}

	if len(newEnvIDs) > 0 {
		newLookup, err := s.secretFolderService.LoadProjectFolders(ctx, opts.projectID, newEnvIDs)
		if err != nil {
			return nil
		}
		opts.folderLookup.Merge(newLookup)
	}

	// Second pass: build location map
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

	var result []SecretInput
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

		var secretValue string
		if sec.EncryptedValue.Valid && len(sec.EncryptedValue.V) > 0 {
			if decrypted, err := opts.cipherPair.Decrypt(sec.EncryptedValue.V); err == nil {
				secretValue = string(decrypted)
			}
		}

		envSlug, _ := opts.folderLookup.GetEnvSlug(loc.envID)

		result = append(result, SecretInput{
			ID:         sec.ID,
			Key:        sec.Key,
			Value:      secretValue,
			Env:        envSlug,
			Path:       loc.path,
			IsImported: true,
		})
	}

	return result
}
