package secret

import (
	"context"
	"database/sql"
	"io"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
	"github.com/infisical/api/internal/services/secretmanager/secretimport"
)

var (
	absoluteFetchDevEnvID     = uuid.MustParse("00000000-0000-0000-0000-0000000000d1")
	absoluteFetchProdEnvID    = uuid.MustParse("00000000-0000-0000-0000-0000000000d2")
	absoluteFetchStagingEnvID = uuid.MustParse("00000000-0000-0000-0000-0000000000d3")
	absoluteFetchSharedEnvID  = uuid.MustParse("00000000-0000-0000-0000-0000000000d4")
)

type fakeAbsoluteFolderLookup struct {
	envIDsBySlug    map[string]uuid.UUID
	slugsByEnvID    map[uuid.UUID]string
	folderIDsByPath map[uuid.UUID]map[string]uuid.UUID
}

func (f *fakeAbsoluteFolderLookup) GetEnvIDBySlug(envSlug string) (uuid.UUID, bool) {
	envID, ok := f.envIDsBySlug[envSlug]
	return envID, ok
}

func (f *fakeAbsoluteFolderLookup) GetByPath(envID uuid.UUID, path string) (*secretfolder.FolderNode, bool) {
	folderID, ok := f.folderIDsByPath[envID][path]
	if !ok {
		return nil, false
	}
	return &secretfolder.FolderNode{ID: folderID}, true
}

func (f *fakeAbsoluteFolderLookup) GetEnvSlug(envID uuid.UUID) (string, bool) {
	slug, ok := f.slugsByEnvID[envID]
	return slug, ok
}

type fakeAbsoluteSecretReader struct {
	secretsByFolder map[uuid.UUID][]Secret
	imports         *secretimport.ImportLookup
	folderBatches   [][]uuid.UUID
	importLoads     int
}

func (f *fakeAbsoluteSecretReader) FindByFolderIds(_ context.Context, folderIDs []uuid.UUID, _ *uuid.UUID, _ *FindByFolderIdsFilter) ([]Secret, error) {
	f.folderBatches = append(f.folderBatches, append([]uuid.UUID{}, folderIDs...))

	var secrets []Secret
	for _, folderID := range folderIDs {
		secrets = append(secrets, f.secretsByFolder[folderID]...)
	}
	return secrets, nil
}

func (f *fakeAbsoluteSecretReader) LoadProjectImports(_ context.Context, _ string) (*secretimport.ImportLookup, error) {
	f.importLoads++
	return f.imports, nil
}

type fakeImportChainResolver struct {
	chainsByFolder  map[uuid.UUID][]secretimport.ResolvedImport
	resolvedFolders []uuid.UUID
}

func (f *fakeImportChainResolver) ResolveChain(startFolderID uuid.UUID, _ func(envID uuid.UUID, path string) (uuid.UUID, bool)) []secretimport.ResolvedImport {
	f.resolvedFolders = append(f.resolvedFolders, startFolderID)
	return f.chainsByFolder[startFolderID]
}

func newTestCipherPair() *kms.CipherPair {
	return kms.NewCipherPair(
		func(plainText []byte) ([]byte, error) { return plainText, nil },
		func(cipherTextBlob []byte) ([]byte, error) { return cipherTextBlob, nil },
	)
}

func newAbsoluteFetchTestSecret(folderID uuid.UUID, key, value string) Secret {
	return Secret{
		ID:             uuid.New(),
		Key:            key,
		FolderID:       folderID,
		EncryptedValue: sql.Null[[]byte]{V: []byte(value), Valid: true},
	}
}

func newListSecretsTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestFetchAbsoluteSecrets_BatchesReferencedFolderReads(t *testing.T) {
	prodRootFolderID := uuid.New()
	devRootFolderID := uuid.New()

	folderLookup := &fakeAbsoluteFolderLookup{
		envIDsBySlug: map[string]uuid.UUID{
			"prod": absoluteFetchProdEnvID,
			"dev":  absoluteFetchDevEnvID,
		},
		slugsByEnvID: map[uuid.UUID]string{
			absoluteFetchProdEnvID: "prod",
			absoluteFetchDevEnvID:  "dev",
		},
		folderIDsByPath: map[uuid.UUID]map[string]uuid.UUID{
			absoluteFetchProdEnvID: {"/": prodRootFolderID},
			absoluteFetchDevEnvID:  {"/": devRootFolderID},
		},
	}
	reader := &fakeAbsoluteSecretReader{secretsByFolder: map[uuid.UUID][]Secret{
		prodRootFolderID: {
			newAbsoluteFetchTestSecret(prodRootFolderID, "HOST", "prod-host"),
			newAbsoluteFetchTestSecret(prodRootFolderID, "PORT", "443"),
		},
		devRootFolderID: {
			newAbsoluteFetchTestSecret(devRootFolderID, "REGION", "us-east-1"),
		},
	}}

	refs := []AbsoluteSecretRef{
		{Env: "prod", Path: "/", Key: "HOST"},
		{Env: "prod", Path: "/", Key: "PORT"},
		{Env: "dev", Path: "/", Key: "REGION"},
	}

	result := fetchAbsoluteSecrets(context.Background(), newListSecretsTestLogger(), reader, refs, AbsoluteFetchOpts{
		ProjectID:    "project-1",
		FolderLookup: folderLookup,
		CipherPair:   newTestCipherPair(),
	})

	require.Len(t, result, 3)
	values := make(map[string]string, len(result))
	for _, sec := range result {
		values[sec.Secret.Key] = sec.Value
		assert.False(t, sec.IsImported)
	}
	assert.Equal(t, map[string]string{
		"HOST":   "prod-host",
		"PORT":   "443",
		"REGION": "us-east-1",
	}, values)

	assert.Equal(t, 0, reader.importLoads, "directly defined keys must not load project imports")
	require.Len(t, reader.folderBatches, 1, "all referenced folders must be read in one batch")
	assert.ElementsMatch(t, []uuid.UUID{prodRootFolderID, devRootFolderID}, reader.folderBatches[0])
}

func TestFetchAbsoluteSecrets_LoadsImportsOnceForMissingKeys(t *testing.T) {
	prodRootFolderID := uuid.New()
	devRootFolderID := uuid.New()

	folderLookup := &fakeAbsoluteFolderLookup{
		envIDsBySlug: map[string]uuid.UUID{
			"prod": absoluteFetchProdEnvID,
			"dev":  absoluteFetchDevEnvID,
		},
		folderIDsByPath: map[uuid.UUID]map[string]uuid.UUID{
			absoluteFetchProdEnvID: {"/": prodRootFolderID},
			absoluteFetchDevEnvID:  {"/": devRootFolderID},
		},
	}
	reader := &fakeAbsoluteSecretReader{
		secretsByFolder: map[uuid.UUID][]Secret{},
		imports:         &secretimport.ImportLookup{},
	}

	refs := []AbsoluteSecretRef{
		{Env: "prod", Path: "/", Key: "MISSING_PROD"},
		{Env: "dev", Path: "/", Key: "MISSING_DEV"},
	}

	result := fetchAbsoluteSecrets(context.Background(), newListSecretsTestLogger(), reader, refs, AbsoluteFetchOpts{
		ProjectID:    "project-1",
		FolderLookup: folderLookup,
		CipherPair:   newTestCipherPair(),
	})

	assert.Empty(t, result)
	assert.Equal(t, 1, reader.importLoads, "project imports must be loaded once for all locations")
	require.Len(t, reader.folderBatches, 1, "referenced folders must be read in one batch")
	assert.ElementsMatch(t, []uuid.UUID{prodRootFolderID, devRootFolderID}, reader.folderBatches[0])
}

func TestAbsoluteFetchTargets_GroupsKeysByLocation(t *testing.T) {
	prodRootFolderID := uuid.New()
	prodConfigFolderID := uuid.New()

	folderLookup := &fakeAbsoluteFolderLookup{
		envIDsBySlug: map[string]uuid.UUID{
			"prod": absoluteFetchProdEnvID,
			"dev":  absoluteFetchDevEnvID,
		},
		folderIDsByPath: map[uuid.UUID]map[string]uuid.UUID{
			absoluteFetchProdEnvID: {"/": prodRootFolderID, "/config": prodConfigFolderID},
		},
	}
	refs := []AbsoluteSecretRef{
		{Env: "prod", Path: "/", Key: "A"},
		{Env: "prod", Path: "/config", Key: "B"},
		{Env: "prod", Path: "/", Key: "C"},
		{Env: "missing", Path: "/", Key: "D"},
		{Env: "dev", Path: "/unknown", Key: "E"},
	}

	targets := absoluteFetchTargets(refs, folderLookup)

	require.Len(t, targets, 2)
	assert.Equal(t, absoluteFetchLocation{env: "prod", path: "/"}, targets[0].location)
	assert.Equal(t, prodRootFolderID, targets[0].folderID)
	assert.Equal(t, map[string]struct{}{"A": {}, "C": {}}, targets[0].wanted)
	assert.Equal(t, absoluteFetchLocation{env: "prod", path: "/config"}, targets[1].location)
	assert.Equal(t, prodConfigFolderID, targets[1].folderID)
	assert.Equal(t, map[string]struct{}{"B": {}}, targets[1].wanted)
}

func TestAbsoluteImportReadPlan_ReversesImportPriority(t *testing.T) {
	rootFolderID := uuid.New()
	firstImportFolderID := uuid.New()
	nestedImportFolderID := uuid.New()

	resolver := &fakeImportChainResolver{chainsByFolder: map[uuid.UUID][]secretimport.ResolvedImport{
		rootFolderID: {
			{FolderID: firstImportFolderID, EnvID: absoluteFetchStagingEnvID, Path: "/", Depth: 0},
			{FolderID: nestedImportFolderID, EnvID: absoluteFetchSharedEnvID, Path: "/nested", Depth: 1},
		},
	}}
	targets := []absoluteFetchTarget{{
		location: absoluteFetchLocation{env: "dev", path: "/"},
		folderID: rootFolderID,
		wanted:   map[string]struct{}{"KEY": {}},
	}}

	chains, folderIDs := absoluteImportReadPlan(targets, []int{0}, resolver, &fakeAbsoluteFolderLookup{})

	require.Len(t, chains[0], 2)
	// The last resolved import wins, matching ListSecretsResult.AllSecrets.
	assert.Equal(t, []uuid.UUID{nestedImportFolderID, firstImportFolderID}, folderIDs)
	assert.Equal(t, []uuid.UUID{rootFolderID}, resolver.resolvedFolders)
}

func TestMatchImportedAbsoluteFetchSecrets_PrefersDirectThenImportPriority(t *testing.T) {
	firstImportFolderID := uuid.New()
	nestedImportFolderID := uuid.New()

	folderLookup := &fakeAbsoluteFolderLookup{slugsByEnvID: map[uuid.UUID]string{
		absoluteFetchStagingEnvID: "staging",
		absoluteFetchSharedEnvID:  "shared",
	}}
	targets := []absoluteFetchTarget{{
		location: absoluteFetchLocation{env: "dev", path: "/"},
		folderID: uuid.New(),
		wanted:   map[string]struct{}{"HOST": {}, "DIRECT_ONLY": {}},
	}}
	found := []map[string]struct{}{{"DIRECT_ONLY": {}}}
	chains := map[int][]secretimport.ResolvedImport{0: {
		{FolderID: firstImportFolderID, EnvID: absoluteFetchStagingEnvID, Path: "/", Depth: 0},
		{FolderID: nestedImportFolderID, EnvID: absoluteFetchSharedEnvID, Path: "/nested", Depth: 1},
	}}
	stagingHost := newAbsoluteFetchTestSecret(firstImportFolderID, "HOST", "staging-host")
	sharedHost := newAbsoluteFetchTestSecret(nestedImportFolderID, "HOST", "shared-host")
	secretsByFolder := map[uuid.UUID][]*Secret{
		firstImportFolderID:  {&stagingHost},
		nestedImportFolderID: {&sharedHost},
	}

	matches := matchImportedAbsoluteFetchSecrets(targets, []int{0}, chains, secretsByFolder, folderLookup, found, nil)

	require.Len(t, matches, 1, "keys already resolved directly must not be taken from imports")
	assert.Equal(t, sharedHost.ID, matches[0].secret.ID)
	assert.True(t, matches[0].imported)
	assert.Equal(t, "shared", matches[0].importEnv)
	assert.Equal(t, "/nested", matches[0].importPath)
}

func TestDecryptAbsoluteFetchMatches_ExposesImportedValueAtRequestedLocation(t *testing.T) {
	secret := newAbsoluteFetchTestSecret(uuid.New(), "STAGING_SECRET", "staging-value")

	result := decryptAbsoluteFetchMatches(
		context.Background(),
		newListSecretsTestLogger(),
		[]absoluteFetchMatch{{
			secret:     &secret,
			location:   absoluteFetchLocation{env: "dev", path: "/app"},
			imported:   true,
			importEnv:  "staging",
			importPath: "/",
		}},
		newTestCipherPair(),
	)

	require.Len(t, result, 1)
	assert.Equal(t, "dev", result[0].Environment)
	assert.Equal(t, "/app", result[0].SecretPath)
	assert.Equal(t, "staging-value", result[0].Value)
	assert.True(t, result[0].IsImported)
	assert.Equal(t, "staging", result[0].ImportEnvironment)
	assert.Equal(t, "/", result[0].ImportPath)
}
