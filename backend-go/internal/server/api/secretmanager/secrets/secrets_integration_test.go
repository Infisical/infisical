//go:build integration

package secrets_test

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/server/api/secretmanager/secrets"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	smShared "github.com/infisical/api/internal/services/secretmanager"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
)

var (
	stack   *infra.Stack
	project *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups").
		MustStart()

	project = stack.NodeJS().MustCreateProject("secrets-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// newSecretsService creates a secrets service for direct testing.
func newSecretsService(t *testing.T) gensecrets.Service {
	t.Helper()

	permDAL := permission.NewDAL(stack.DB())
	permLib := permission.NewService(testutil.NopLogger(), permission.Deps{DAL: permDAL})

	authDAL := auth.NewDAL(stack.DB())
	authHandler := auth.NewAuthHandler(authDAL, infra.AuthSecret)

	redisClient := stack.Redis().Client()
	t.Cleanup(func() { redisClient.Close() })

	ks := keystore.NewKeyStore(redisClient, stack.DB().Primary())
	kmsDAL := kms.NewDAL(stack.DB(), ks)
	kmsSvc, err := kms.NewService(kms.Deps{
		DAL:    kmsDAL,
		HSM:    nil,
		Config: stack.Config(),
	})
	require.NoError(t, err)

	smSharedSvcs := smShared.NewServices(smShared.ServicesDeps{DB: stack.DB()})

	return secrets.NewService(testutil.NopLogger(), &secrets.Deps{
		AuthHandler:    authHandler,
		Permission:     permLib,
		KMS:            kmsSvc,
		SecretFolder:   smSharedSvcs.SecretFolder,
		SecretImport:   smSharedSvcs.SecretImport,
		SecretDAL:      smSharedSvcs.SecretDAL,
		EnvironmentDAL: smSharedSvcs.EnvironmentDAL,
	})
}

// listSecretsAsAdmin is a helper that lists secrets as an admin identity.
func listSecretsAsAdmin(t *testing.T, identityID, orgID string, payload *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      permission.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identityID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsService(t)
	return svc.ListSecretsV4(ctx, payload)
}

// =============================================================================
// Basic Operations Tests
// =============================================================================

func TestListSecrets_ReturnsCorrectStructure(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "structure-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "STRUCTURE_SECRET", "structure-value")

	identity := nodejs.CreateIdentity(t, "structure-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)

	secret := result.Secrets[0]
	assert.NotEmpty(t, secret.ID)
	assert.Equal(t, "STRUCTURE_SECRET", secret.SecretKey)
	assert.Equal(t, "structure-value", secret.SecretValue)
	assert.Equal(t, proj.EnvSlug, secret.Environment)
	assert.NotEmpty(t, secret.Workspace)
	assert.NotEmpty(t, secret.CreatedAt)
	assert.NotEmpty(t, secret.UpdatedAt)
	assert.Equal(t, 1, secret.Version)
	assert.Equal(t, "shared", secret.Type)
}

func TestListSecrets_DecryptsValues(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "decrypt-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENCRYPTED_SECRET", "decrypted-correctly")

	identity := nodejs.CreateIdentity(t, "decrypt-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "decrypted-correctly", result.Secrets[0].SecretValue)
}

func TestListSecrets_IncludesTags(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "tags-test")

	tag1 := nodejs.CreateTag(t, proj.ID, "env-prod", "Production", "#FF0000")
	tag2 := nodejs.CreateTag(t, proj.ID, "sensitive", "Sensitive", "#0000FF")

	nodejs.CreateSecretWithTags(t, proj.ID, proj.EnvSlug, "/", "TAGGED_SECRET", "tagged-value", []string{tag1.ID, tag2.ID})

	identity := nodejs.CreateIdentity(t, "tags-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	require.Len(t, result.Secrets[0].Tags, 2)

	tagSlugs := make([]string, len(result.Secrets[0].Tags))
	for i, tag := range result.Secrets[0].Tags {
		tagSlugs[i] = tag.Slug
	}
	assert.Contains(t, tagSlugs, "env-prod")
	assert.Contains(t, tagSlugs, "sensitive")
}

func TestListSecrets_MultipleSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "multi-secrets-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "A_SECRET", "value-a")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "B_SECRET", "value-b")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "C_SECRET", "value-c")

	identity := nodejs.CreateIdentity(t, "multi-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 3)

	keys := make([]string, len(result.Secrets))
	for i, s := range result.Secrets {
		keys[i] = s.SecretKey
	}
	assert.Contains(t, keys, "A_SECRET")
	assert.Contains(t, keys, "B_SECRET")
	assert.Contains(t, keys, "C_SECRET")
}

// =============================================================================
// Secret Imports Tests
// =============================================================================

func TestListSecrets_IncludeImports_ReturnsImportedSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "imports-include-test")
	nodejs.CreateEnvironment(t, proj.ID, "staging", "Staging")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_DB_URL", "staging-db-value")
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_KEY", "staging-api-value")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value")

	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "imports-include-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  true,
	})

	require.NoError(t, err)

	// Direct secrets
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", result.Secrets[0].SecretKey)

	// Imported secrets
	require.Len(t, result.Imports, 1)
	assert.Equal(t, "staging", result.Imports[0].Environment)
	assert.Equal(t, "/", result.Imports[0].SecretPath)
	require.Len(t, result.Imports[0].Secrets, 2)

	importKeys := make([]string, len(result.Imports[0].Secrets))
	for i, s := range result.Imports[0].Secrets {
		importKeys[i] = s.SecretKey
	}
	assert.Contains(t, importKeys, "STAGING_DB_URL")
	assert.Contains(t, importKeys, "STAGING_API_KEY")
}

func TestListSecrets_ExcludeImports_OmitsImportedSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "imports-exclude-test")
	nodejs.CreateEnvironment(t, proj.ID, "staging", "Staging")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "IMPORTED_SECRET", "imported-value")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DIRECT_SECRET", "direct-value")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "imports-exclude-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  false,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "DIRECT_SECRET", result.Secrets[0].SecretKey)
	assert.Nil(t, result.Imports, "imports should not be included when IncludeImports=false")
}

func TestListSecrets_CrossEnvironmentImport(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "cross-env-import-test")
	nodejs.CreateEnvironment(t, proj.ID, "production", "Production")

	nodejs.CreateSecret(t, proj.ID, "production", "/", "PROD_DATABASE_URL", "prod-db-url")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "production", "/")

	identity := nodejs.CreateIdentity(t, "cross-env-import-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  true,
	})

	require.NoError(t, err)
	require.Len(t, result.Imports, 1)
	assert.Equal(t, "production", result.Imports[0].Environment)
	require.Len(t, result.Imports[0].Secrets, 1)
	assert.Equal(t, "PROD_DATABASE_URL", result.Imports[0].Secrets[0].SecretKey)
	assert.Equal(t, "prod-db-url", result.Imports[0].Secrets[0].SecretValue)
}

func TestListSecrets_ImportFromSubfolder(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "import-subfolder-test")

	nodejs.CreateFolder(t, proj.ID, "dev", "/", "shared")
	nodejs.CreateSecret(t, proj.ID, "dev", "/shared", "SHARED_CONFIG", "shared-config-value")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "dev", "/shared")

	identity := nodejs.CreateIdentity(t, "import-subfolder-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  true,
	})

	require.NoError(t, err)
	require.Len(t, result.Imports, 1)
	assert.Equal(t, "dev", result.Imports[0].Environment)
	assert.Equal(t, "/shared", result.Imports[0].SecretPath)
	require.Len(t, result.Imports[0].Secrets, 1)
	assert.Equal(t, "SHARED_CONFIG", result.Imports[0].Secrets[0].SecretKey)
}

// =============================================================================
// Secret Expansion Tests
// =============================================================================

func TestListSecrets_SingleLevelExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-single-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DATABASE_HOST", "localhost")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DATABASE_URL", "postgres://${DATABASE_HOST}:5432/mydb")

	identity := nodejs.CreateIdentity(t, "expansion-single-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 2)

	var databaseURL string
	for _, s := range result.Secrets {
		if s.SecretKey == "DATABASE_URL" {
			databaseURL = s.SecretValue
			break
		}
	}

	assert.Equal(t, "postgres://localhost:5432/mydb", databaseURL, "secret reference should be expanded")
}

func TestListSecrets_NestedExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-nested-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PORT", "5432")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:${PORT}")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "FULL_URL", "https://${ENDPOINT}/api")

	identity := nodejs.CreateIdentity(t, "expansion-nested-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)

	var fullURL, endpoint string
	for _, s := range result.Secrets {
		switch s.SecretKey {
		case "FULL_URL":
			fullURL = s.SecretValue
		case "ENDPOINT":
			endpoint = s.SecretValue
		}
	}

	assert.Equal(t, "myhost.com:5432", endpoint, "ENDPOINT should expand HOST and PORT")
	assert.Equal(t, "https://myhost.com:5432/api", fullURL, "FULL_URL should expand nested references")
}

func TestListSecrets_CrossEnvironmentExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-cross-env-test")
	nodejs.CreateEnvironment(t, proj.ID, "shared", "Shared")

	nodejs.CreateSecret(t, proj.ID, "shared", "/", "SHARED_API_KEY", "shared-api-key-value")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "MY_API_KEY", "${shared.SHARED_API_KEY}")

	identity := nodejs.CreateIdentity(t, "expansion-cross-env-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            "dev",
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "shared-api-key-value", result.Secrets[0].SecretValue)
}

func TestListSecrets_CrossPathExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-cross-path-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "common")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/common", "COMMON_SECRET", "common-value")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "${dev./common.COMMON_SECRET}")

	identity := nodejs.CreateIdentity(t, "expansion-cross-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            "dev",
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "common-value", result.Secrets[0].SecretValue)
}

func TestListSecrets_MissingReference_PreservesOriginal(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-missing-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "BROKEN_REF", "${NON_EXISTENT_SECRET}")

	identity := nodejs.CreateIdentity(t, "expansion-missing-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Contains(t, result.Secrets[0].SecretValue, "NON_EXISTENT_SECRET", "missing reference should be preserved")
}

func TestListSecrets_NoExpansion_PreservesReferences(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "no-expansion-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "BASE_VALUE", "base")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "REF_VALUE", "${BASE_VALUE}")

	identity := nodejs.CreateIdentity(t, "no-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: false,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 2)

	var refValue string
	for _, s := range result.Secrets {
		if s.SecretKey == "REF_VALUE" {
			refValue = s.SecretValue
			break
		}
	}

	assert.Equal(t, "${BASE_VALUE}", refValue, "reference should NOT be expanded when ExpandSecretReferences=false")
}

// =============================================================================
// Recursive Listing Tests
// =============================================================================

func TestListSecrets_Recursive_IncludesSubfolders(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "recursive-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "level1")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/level1", "level2")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_SECRET", "root-value")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1", "LEVEL1_SECRET", "level1-value")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1/level2", "LEVEL2_SECRET", "level2-value")

	identity := nodejs.CreateIdentity(t, "recursive-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
		Recursive:       true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 3, "recursive should return all secrets from all subfolders")

	keys := make([]string, len(result.Secrets))
	for i, s := range result.Secrets {
		keys[i] = s.SecretKey
	}
	assert.Contains(t, keys, "ROOT_SECRET")
	assert.Contains(t, keys, "LEVEL1_SECRET")
	assert.Contains(t, keys, "LEVEL2_SECRET")
}

func TestListSecrets_NonRecursive_OnlyCurrentFolder(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "non-recursive-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "subfolder")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_ONLY", "root-value")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/subfolder", "SUB_SECRET", "sub-value")

	identity := nodejs.CreateIdentity(t, "non-recursive-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
		Recursive:       false,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1, "non-recursive should only return secrets from current folder")
	assert.Equal(t, "ROOT_ONLY", result.Secrets[0].SecretKey)
}

// =============================================================================
// Path Filtering Tests
// =============================================================================

func TestListSecrets_SpecificPath(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "specific-path-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "api")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "web")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/api", "API_SECRET", "api-value")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/web", "WEB_SECRET", "web-value")

	identity := nodejs.CreateIdentity(t, "specific-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/api",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "API_SECRET", result.Secrets[0].SecretKey)
}

// =============================================================================
// Error Cases Tests
// =============================================================================

func TestListSecrets_EnvironmentNotFound(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "env-not-found-test")

	identity := nodejs.CreateIdentity(t, "env-not-found-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	_, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "nonexistent",
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestListSecrets_FolderNotFound(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "folder-not-found-test")

	identity := nodejs.CreateIdentity(t, "folder-not-found-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	_, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/nonexistent/path",
		ViewSecretValue: true,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
