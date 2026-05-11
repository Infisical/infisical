package secrets

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secretmanager/environment"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

const secretValueHiddenMask = "<hidden-by-infisical>"

// AccessChecker verifies if a user can access secrets at given locations.
// Pass nil to skip permission checks (e.g., for internal/integration use).
type AccessChecker interface {
	CanDescribeSecret(env, path, key string, tagSlugs []string) bool
	CanReadSecretValue(env, path, key string, tagSlugs []string) bool
}

// SecretService queries secrets from the database.
type SecretService interface {
	FindByFolderIds(ctx context.Context, folderIDs []uuid.UUID, userID *uuid.UUID, filters *secret.FindByFolderIdsFilter) ([]secret.Secret, error)
	FindByKey(ctx context.Context, folderID uuid.UUID, key, secretType string, userID *uuid.UUID) (*secret.Secret, error)
}

// SecretFolderService loads folder hierarchies for a project.
type SecretFolderService interface {
	LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*secretfolder.FolderLookup, error)
}

// SecretImportService loads import configurations for a project.
type SecretImportService interface {
	LoadProjectImports(ctx context.Context, projectID string) (*secretimport.ImportLookup, error)
}

// EnvironmentService loads environments for a project.
type EnvironmentService interface {
	GetAllByProjectID(ctx context.Context, projectID string) ([]environment.Environment, error)
}

// KMSService creates cipher pairs for encryption/decryption.
type KMSService interface {
	CreateCipherPairWithDataKey(ctx context.Context, dto kms.CreateCipherPairDTO) (*kms.CipherPair, error)
}

// Deps holds the dependencies for the secrets service.
type Deps struct {
	SecretService       SecretService
	SecretFolderService SecretFolderService
	SecretImportService SecretImportService
	EnvironmentService  EnvironmentService
	KMSService          KMSService
}

// Service handles secret retrieval with decryption and expansion.
type Service struct {
	logger              *slog.Logger
	secretService       SecretService
	secretFolderService SecretFolderService
	secretImportService SecretImportService
	environmentService  EnvironmentService
	kmsService          KMSService
}

// NewService creates a new secrets service.
func NewService(logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger:              logger.With(slog.String("service", "secrets")),
		secretService:       deps.SecretService,
		secretFolderService: deps.SecretFolderService,
		secretImportService: deps.SecretImportService,
		environmentService:  deps.EnvironmentService,
		kmsService:          deps.KMSService,
	}
}

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

// DecryptedMetadata holds a decrypted metadata entry.
type DecryptedMetadata struct {
	Key   string
	Value string
}

// ProcessedSecret holds a secret with its computed metadata.
type ProcessedSecret struct {
	Secret            *secret.Secret
	SecretPath        string
	Environment       string
	Value             string
	Comment           string
	Metadata          []DecryptedMetadata
	ValueHidden       bool
	IsImported        bool
	ImportFolderID    uuid.UUID
	ImportEnvironment string
	ImportPath        string
}

// ListSecretsResult contains the results of listing secrets.
type ListSecretsResult struct {
	DirectSecrets   []ProcessedSecret
	ImportedSecrets []ProcessedSecret
	Imports         []secretimport.ResolvedImport
}

// ListSecrets retrieves secrets for a project/environment/path with full processing.
func (s *Service) ListSecrets(ctx context.Context, opts *ListSecretsOpts) (*ListSecretsResult, error) {
	// 1. Load all environments
	allEnvs, err := s.environmentService.GetAllByProjectID(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("ListSecrets: %w", err)
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
		return nil, errutil.NotFound("Environment not found")
	}

	// 2. Load imports
	importLookup, err := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("ListSecrets: %w", err)
	}

	// 3. Resolve folder chain
	chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderService)
	chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, opts.Recursive, envByID)
	if err != nil {
		return nil, errutil.NotFound("Folder not found").WithErrf("ListSecrets: %w", err)
	}

	// 4. Fetch secrets from all folders
	allFolderIDs := chainResult.AllFolderIDs()

	var dalFilters *secret.FindByFolderIdsFilter
	if len(opts.TagSlugs) > 0 || len(opts.MetadataFilter) > 0 {
		dalFilters = &secret.FindByFolderIdsFilter{}
		if len(opts.TagSlugs) > 0 {
			dalFilters.TagSlugs = opts.TagSlugs
		}
		if len(opts.MetadataFilter) > 0 {
			dalFilters.MetadataFilter = make([]secret.MetadataFilter, len(opts.MetadataFilter))
			for i, mf := range opts.MetadataFilter {
				dalFilters.MetadataFilter[i] = secret.MetadataFilter{
					Key:   mf.Key,
					Value: mf.Value,
				}
			}
		}
	}

	secrets, err := s.secretService.FindByFolderIds(ctx, allFolderIDs, opts.UserID, dalFilters)
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

		absoluteFetcher := newAbsoluteSecretFetcher(
			ctx,
			opts.ProjectID,
			envBySlug,
			chainResult.FolderLookup,
			s.secretFolderService,
			s.secretService,
			cipherPair,
			expansionUserID,
		)

		expander := NewSecretExpander(inputs, ExpandOpts{
			CanAccessAbsolute: func(ref AbsoluteSecretRef) bool {
				if opts.AccessChecker == nil {
					return true
				}
				return opts.AccessChecker.CanReadSecretValue(ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: absoluteFetcher.Fetch,
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
	}, nil
}

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
	// 1. Load environments
	allEnvs, err := s.environmentService.GetAllByProjectID(ctx, opts.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load environments").WithErrf("GetSecretByName: %w", err)
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
		return nil, errutil.NotFound("Environment not found")
	}

	// 2. Load folder
	folderLookup, err := s.secretFolderService.LoadProjectFolders(ctx, opts.ProjectID, []uuid.UUID{env.ID})
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to load folders").WithErrf("GetSecretByName: %w", err)
	}

	folderNode, ok := folderLookup.GetByPath(env.ID, opts.SecretPath)
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

	foundSecret, err := s.secretService.FindByKey(ctx, folderNode.ID, opts.SecretName, secretType, opts.UserID)
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
		chainResult, err := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, false, envByID)
		if err == nil && len(chainResult.Imports) > 0 {
			for i := len(chainResult.Imports) - 1; i >= 0; i-- {
				imp := &chainResult.Imports[i]
				importedSecret, err := s.secretService.FindByKey(ctx, imp.FolderID, opts.SecretName, secretType, opts.UserID)
				if err != nil {
					continue
				}
				if importedSecret != nil {
					foundSecret = importedSecret
					secretEnv = imp.EnvSlug
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
			return nil, errutil.Forbidden("Permission denied to access this secret")
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

	var metadata []DecryptedMetadata
	for _, m := range foundSecret.SecretMetadata {
		value := m.Value
		if len(m.EncryptedValue) > 0 {
			if decrypted, err := cipherPair.Decrypt(m.EncryptedValue); err == nil {
				value = string(decrypted)
			}
		}
		metadata = append(metadata, DecryptedMetadata{
			Key:   m.Key,
			Value: value,
		})
	}

	// 8. Expand references if requested
	if opts.ExpandSecretReferences && !valueHidden && secretValue != "" {
		importLookup, _ := s.secretImportService.LoadProjectImports(ctx, opts.ProjectID)
		chainResolver := secretimport.NewChainResolver(importLookup, s.secretFolderService)
		chainResult, _ := chainResolver.Resolve(ctx, opts.ProjectID, env.ID, opts.SecretPath, false, envByID)

		inputs := []SecretInput{{
			ID:         foundSecret.ID,
			Key:        foundSecret.Key,
			Value:      secretValue,
			Env:        opts.Environment,
			Path:       opts.SecretPath,
			IsImported: false,
		}}

		if len(chainResult.Imports) > 0 {
			allFolderIDs := chainResult.AllFolderIDs()
			importedSecrets, _ := s.secretService.FindByFolderIds(ctx, allFolderIDs, opts.UserID, nil)
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
				inputs = append(inputs, SecretInput{
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
			s.secretFolderService,
			s.secretService,
			cipherPair,
			opts.UserID,
		)

		expander := NewSecretExpander(inputs, ExpandOpts{
			CanAccessAbsolute: func(ref AbsoluteSecretRef) bool {
				if opts.AccessChecker == nil {
					return true
				}
				return opts.AccessChecker.CanReadSecretValue(ref.Env, ref.Path, ref.Key, nil)
			},
			FetchAbsoluteSecrets: absoluteFetcher.Fetch,
		})
		expander.Expand()

		if expander.HasDeniedRefs() {
			return nil, errutil.Forbidden("Permission denied for secret reference expansion").WithErrf("GetSecretByName: denied refs: %v", expander.DeniedRefs())
		}

		if expanded, ok := expander.LookUp(foundSecret.ID); ok {
			secretValue = expanded
		}
	}

	return &GetSecretByNameResult{
		Secret: &ProcessedSecret{
			Secret:      foundSecret,
			SecretPath:  secretPath,
			Environment: secretEnv,
			Value:       secretValue,
			Comment:     secretComment,
			Metadata:    metadata,
			ValueHidden: valueHidden,
		},
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
	rawSecrets []secret.Secret,
	directFolderIDs []uuid.UUID,
	directPaths map[uuid.UUID]string,
	imports []secretimport.ResolvedImport,
	requestedEnv string,
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
			envSlug = imp.EnvSlug
			isImported = true
			importFolderID = imp.Import.FolderID
			importEnv = imp.EnvSlug
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
		secretMap := make(map[string]ProcessedSecret)
		for i := range secretsList {
			sec := &secretsList[i]
			key := sec.Secret.Key + "-" + sec.Secret.FolderID.String()
			existing, exists := secretMap[key]
			if !exists {
				secretMap[key] = *sec
			} else if sec.Secret.Type == "personal" {
				secretMap[key] = *sec
			}
			_ = existing
		}
		result := make([]ProcessedSecret, 0, len(secretMap))
		for key := range secretMap {
			result = append(result, secretMap[key])
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

	importOrder := reverseImportOrder(imports)

	importedByFolderID := make(map[uuid.UUID][]ProcessedSecret)
	for i := range importedSecrets {
		sec := &importedSecrets[i]
		importedByFolderID[sec.Secret.FolderID] = append(importedByFolderID[sec.Secret.FolderID], *sec)
	}

	for i := range importOrder {
		imp := &importOrder[i]
		folderSecrets := importedByFolderID[imp.FolderID]
		for j := range folderSecrets {
			sec := &folderSecrets[j]
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

// reverseImportOrder returns imports in reverse order.
func reverseImportOrder(imports []secretimport.ResolvedImport) []secretimport.ResolvedImport {
	n := len(imports)
	result := make([]secretimport.ResolvedImport, n)
	for i := range imports {
		result[n-1-i] = imports[i]
	}
	return result
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

// absoluteSecretFetcher handles fetching secrets for absolute references.
type absoluteSecretFetcher struct {
	ctx          context.Context
	projectID    string
	envBySlug    map[string]uuid.UUID
	folderLookup *secretfolder.FolderLookup
	folderSvc    SecretFolderService
	secretSvc    SecretService
	cipherPair   *kms.CipherPair
	userID       *uuid.UUID
}

// newAbsoluteSecretFetcher creates a fetcher for absolute secret references.
func newAbsoluteSecretFetcher(
	ctx context.Context,
	projectID string,
	envBySlug map[string]uuid.UUID,
	folderLookup *secretfolder.FolderLookup,
	folderSvc SecretFolderService,
	secretSvc SecretService,
	cipherPair *kms.CipherPair,
	userID *uuid.UUID,
) *absoluteSecretFetcher {
	return &absoluteSecretFetcher{
		ctx:          ctx,
		projectID:    projectID,
		envBySlug:    envBySlug,
		folderLookup: folderLookup,
		folderSvc:    folderSvc,
		secretSvc:    secretSvc,
		cipherPair:   cipherPair,
		userID:       userID,
	}
}

// Fetch retrieves secrets for the given absolute references.
func (f *absoluteSecretFetcher) Fetch(refs []AbsoluteSecretRef) []SecretInput {
	if len(refs) == 0 {
		return nil
	}

	type locationKey struct {
		envID uuid.UUID
		path  string
	}

	locationToKeys := make(map[locationKey]map[string]struct{})
	var newEnvIDs []uuid.UUID
	seenEnvs := make(map[uuid.UUID]bool)

	for i := range refs {
		ref := &refs[i]
		envID, ok := f.envBySlug[ref.Env]
		if !ok {
			continue
		}

		key := locationKey{envID: envID, path: ref.Path}
		if locationToKeys[key] == nil {
			locationToKeys[key] = make(map[string]struct{})
		}
		locationToKeys[key][ref.Key] = struct{}{}

		if !seenEnvs[envID] && !f.folderLookup.HasEnv(envID) {
			newEnvIDs = append(newEnvIDs, envID)
			seenEnvs[envID] = true
		}
	}

	if len(newEnvIDs) > 0 {
		newLookup, err := f.folderSvc.LoadProjectFolders(f.ctx, f.projectID, newEnvIDs)
		if err != nil {
			return nil
		}
		f.folderLookup.Merge(newLookup)
	}

	var folderIDs []uuid.UUID
	folderToLocation := make(map[uuid.UUID]locationKey)

	for loc := range locationToKeys {
		node, ok := f.folderLookup.GetByPath(loc.envID, loc.path)
		if !ok {
			continue
		}
		folderIDs = append(folderIDs, node.ID)
		folderToLocation[node.ID] = loc
	}

	if len(folderIDs) == 0 {
		return nil
	}

	rawSecrets, err := f.secretSvc.FindByFolderIds(f.ctx, folderIDs, f.userID, nil)
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
			if decrypted, err := f.cipherPair.Decrypt(sec.EncryptedValue.V); err == nil {
				secretValue = string(decrypted)
			}
		}

		envSlug := ""
		for slug, id := range f.envBySlug {
			if id == loc.envID {
				envSlug = slug
				break
			}
		}

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
