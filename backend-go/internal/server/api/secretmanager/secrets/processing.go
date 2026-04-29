package secrets

import (
	"context"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"

	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/secretmanager/secret"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
	"github.com/infisical/api/internal/services/secretmanager/secrets"
)

const secretValueHiddenMask = "<hidden-by-infisical>"

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

// processedSecret holds a secret with its computed metadata.
type processedSecret struct {
	Secret            *secret.Secret
	SecretPath        string
	Environment       string
	Value             string
	Comment           string
	ValueHidden       bool
	IsImported        bool
	ImportFolderID    uuid.UUID // The folder ID of the import entry that brought this secret in
	ImportEnvironment string
	ImportPath        string
}

// secretProcessorOpts configures secret processing.
type secretProcessorOpts struct {
	ViewSecretValue bool
	Ability         *gocasl.Ability
	CipherPair      *kms.CipherPair
	RequestedPath   string // Original requested path (for recursive filtering)
	Recursive       bool   // Whether this is a recursive listing
}

// processSecretsWithPermissions filters and decrypts secrets based on permissions.
// Returns direct secrets and imported secrets separately for proper ordering.
func processSecretsWithPermissions(
	rawSecrets []secret.Secret,
	directFolderIDs []uuid.UUID,
	directPaths map[uuid.UUID]string,
	imports []secretimport.ResolvedImport,
	requestedEnv string,
	opts secretProcessorOpts,
) (directSecrets, importedSecrets []processedSecret) {
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
		var secretPath, environment string
		var isImported bool
		var importFolderID uuid.UUID
		var importEnv, importPath string

		if directFolderSet[sec.FolderID] {
			secretPath = directPaths[sec.FolderID]
			environment = requestedEnv
			isImported = false
		} else if imp, ok := importByFolderID[sec.FolderID]; ok {
			secretPath = imp.Path
			environment = imp.EnvSlug
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

		canDescribe := permission.CanDescribeSecret(opts.Ability, environment, secretPath, sec.Key, tagSlugs)
		if !canDescribe {
			continue
		}

		canReadValue := permission.CanReadSecretValue(opts.Ability, environment, secretPath, sec.Key, tagSlugs)

		// When listing recursively with viewSecretValue=true, filter out secrets from
		// non-root paths if user doesn't have ReadValue permission (Node.js behavior).
		// This is different from just masking - the secret is completely excluded.
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

		processed := processedSecret{
			Secret:            sec,
			SecretPath:        secretPath,
			Environment:       environment,
			Value:             secretValue,
			Comment:           secretComment,
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
// - IncludeAll: returns all secrets as-is (both shared and personal)
// - NeverInclude: returns only shared secrets
// - Priority: personal secrets take precedence over shared (1 secret per key+folder)
func filterByPersonalOverridesBehavior(secretsList []processedSecret, behavior PersonalOverridesBehavior) []processedSecret {
	switch behavior {
	case PersonalOverridesIncludeAll:
		return secretsList

	case PersonalOverridesNeverInclude:
		result := make([]processedSecret, 0, len(secretsList))
		for i := range secretsList {
			if secretsList[i].Secret.Type == "shared" {
				result = append(result, secretsList[i])
			}
		}
		return result

	case PersonalOverridesPriority:
		secretMap := make(map[string]processedSecret)
		for i := range secretsList {
			sec := &secretsList[i]
			key := sec.Secret.Key + "-" + sec.Secret.FolderID.String()
			existing, exists := secretMap[key]
			if !exists {
				secretMap[key] = *sec
			} else if sec.Secret.Type == "personal" {
				secretMap[key] = *sec
			}
			_ = existing // keep existing if current is shared
		}
		result := make([]processedSecret, 0, len(secretMap))
		for key := range secretMap {
			result = append(result, secretMap[key])
		}
		return result

	default:
		return secretsList
	}
}

// buildSecretInputsForExpansion builds SecretInput slice for the expander.
// Order: direct secrets first, then imports in reverse order (last import first).
func buildSecretInputsForExpansion(
	directSecrets []processedSecret,
	importedSecrets []processedSecret,
	imports []secretimport.ResolvedImport,
) []secrets.SecretInput {
	inputs := make([]secrets.SecretInput, 0, len(directSecrets)+len(importedSecrets))

	for i := range directSecrets {
		sec := &directSecrets[i]
		if sec.ValueHidden {
			continue
		}
		inputs = append(inputs, secrets.SecretInput{
			ID:         sec.Secret.ID,
			Key:        sec.Secret.Key,
			Value:      sec.Value,
			Env:        sec.Environment,
			Path:       sec.SecretPath,
			IsImported: false,
		})
	}

	importOrder := reverseImportOrder(imports)

	importedByFolderID := make(map[uuid.UUID][]processedSecret)
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
			inputs = append(inputs, secrets.SecretInput{
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

// reverseImportOrder returns imports in reverse order (last import first).
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
	directSecrets []processedSecret,
	importedSecrets []processedSecret,
	expander *secrets.SecretExpander,
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
	folderSvc    folderLoader
	secretDAL    secretFinder
	cipherPair   *kms.CipherPair
	userID       *uuid.UUID
}

type folderLoader interface {
	LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*secretfolder.FolderLookup, error)
}

type secretFinder interface {
	FindByFolderIds(ctx context.Context, folderIDs []uuid.UUID, userID *uuid.UUID, filters *secret.FindByFolderIdsFilter) ([]secret.Secret, error)
}

// newAbsoluteSecretFetcher creates a fetcher for absolute secret references.
func newAbsoluteSecretFetcher(
	ctx context.Context,
	projectID string,
	envBySlug map[string]uuid.UUID,
	folderLookup *secretfolder.FolderLookup,
	folderSvc folderLoader,
	secretDAL secretFinder,
	cipherPair *kms.CipherPair,
	userID *uuid.UUID,
) *absoluteSecretFetcher {
	return &absoluteSecretFetcher{
		ctx:          ctx,
		projectID:    projectID,
		envBySlug:    envBySlug,
		folderLookup: folderLookup,
		folderSvc:    folderSvc,
		secretDAL:    secretDAL,
		cipherPair:   cipherPair,
		userID:       userID,
	}
}

// Fetch retrieves secrets for the given absolute references.
func (f *absoluteSecretFetcher) Fetch(refs []secrets.AbsoluteSecretRef) []secrets.SecretInput {
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

	rawSecrets, err := f.secretDAL.FindByFolderIds(f.ctx, folderIDs, f.userID, nil)
	if err != nil {
		return nil
	}

	var result []secrets.SecretInput
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

		result = append(result, secrets.SecretInput{
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
