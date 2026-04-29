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

	err = kmsSvc.Start(context.Background(), false)
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
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "STRUCTURE_SECRET", "structure-value", nil)

	identity := nodejs.CreateIdentity(t, "structure-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENCRYPTED_SECRET", "decrypted-correctly", nil)

	identity := nodejs.CreateIdentity(t, "decrypt-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TAGGED_SECRET", "tagged-value", &infra.CreateSecretOpts{TagIDs: []string{tag1.ID, tag2.ID}})

	identity := nodejs.CreateIdentity(t, "tags-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "A_SECRET", "value-a", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "B_SECRET", "value-b", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "C_SECRET", "value-c", nil)

	identity := nodejs.CreateIdentity(t, "multi-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_DB_URL", "staging-db-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_KEY", "staging-api-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)

	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "imports-include-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "IMPORTED_SECRET", "imported-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DIRECT_SECRET", "direct-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "imports-exclude-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

func TestListSecrets_ExpansionWithImports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-imports-test")

	// Setup: Multi-level import structure with folders
	//
	// prod environment:
	//   /           -> PROD_ROOT = "prod-root"
	//   /config     -> PROD_DB_HOST = "prod-db.example.com"
	//                  SHARED_KEY = "prod-shared-value"
	//
	// staging environment:
	//   /           -> STAGING_API_URL = "https://staging-api.example.com"
	//                  SHARED_KEY = "staging-shared-value"
	//                  IMPORT_PRIORITY_KEY = "from-first-import"
	//   /services   -> SERVICE_URL = "https://staging-service.example.com"
	//                  IMPORT_PRIORITY_KEY = "from-second-import"
	//   imports prod:/config into staging:/
	//
	// dev environment:
	//   /           -> LOCAL_SECRET = "local-only"
	//                  SHARED_KEY = "dev-shared-value" (local override)
	//   /app        -> APP_CONFIG = "app-config"
	//   imports staging:/ into dev:/ (first import - higher priority)
	//   imports staging:/services into dev:/ (second import)
	//   imports prod:/config into dev:/app (folder-to-folder import)
	//
	// Test references:
	//   REF_LOCAL = "${LOCAL_SECRET}" -> local
	//   REF_STAGING = "${STAGING_API_URL}" -> staging import
	//   REF_SHARED = "${SHARED_KEY}" -> local (priority)
	//   REF_IMPORT_PRIORITY = "${IMPORT_PRIORITY_KEY}" -> last import (staging:/services) wins
	//   REF_SERVICE = "${SERVICE_URL}" -> staging/services import
	//   REF_PROD_VIA_STAGING = "${PROD_DB_HOST}" -> prod via staging import chain
	//   REF_CHAIN = "host=${PROD_DB_HOST}&api=${STAGING_API_URL}"
	//   REF_MISSING = "${NOT_EXISTS}"

	// Create folders
	nodejs.CreateFolder(t, proj.ID, "prod", "/", "config")
	nodejs.CreateFolder(t, proj.ID, "staging", "/", "services")
	nodejs.CreateFolder(t, proj.ID, "dev", "/", "app")

	// Prod secrets
	nodejs.CreateSecret(t, proj.ID, "prod", "/", "PROD_ROOT", "prod-root", nil)
	nodejs.CreateSecret(t, proj.ID, "prod", "/config", "PROD_DB_HOST", "prod-db.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "prod", "/config", "SHARED_KEY", "prod-shared-value", nil)

	// Staging secrets + import from prod/config
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_URL", "https://staging-api.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "SHARED_KEY", "staging-shared-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "IMPORT_PRIORITY_KEY", "from-first-import", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/services", "SERVICE_URL", "https://staging-service.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/services", "IMPORT_PRIORITY_KEY", "from-second-import", nil)
	nodejs.CreateSecretImport(t, proj.ID, "staging", "/", "prod", "/config")

	// Dev secrets
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "LOCAL_SECRET", "local-only", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "SHARED_KEY", "dev-shared-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/app", "APP_CONFIG", "app-config", nil)

	// Dev reference secrets
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_LOCAL", "${LOCAL_SECRET}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_STAGING", "${STAGING_API_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_SHARED", "${SHARED_KEY}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_SERVICE", "${SERVICE_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_PROD_VIA_STAGING", "${PROD_DB_HOST}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_CHAIN", "host=${PROD_DB_HOST}&api=${STAGING_API_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_MISSING", "${NOT_EXISTS}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_IMPORT_PRIORITY", "${IMPORT_PRIORITY_KEY}", nil)

	// Dev imports (order matters for priority)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/services")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/app", "prod", "/config")

	// Dev/app reference secret that uses folder-level import
	nodejs.CreateSecret(t, proj.ID, "dev", "/app", "APP_DB_URL", "postgres://${PROD_DB_HOST}:5432/app", nil)

	identity := nodejs.CreateIdentity(t, "expansion-imports-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Test root level expansion with imports
	t.Run("root level expansion", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			IncludeImports:         true,
			ExpandSecretReferences: true,
		})

		require.NoError(t, err)

		secretValues := make(map[string]string)
		for _, s := range result.Secrets {
			secretValues[s.SecretKey] = s.SecretValue
		}

		// Local reference
		assert.Equal(t, "local-only", secretValues["REF_LOCAL"], "should expand from local")

		// Import-only reference
		assert.Equal(t, "https://staging-api.example.com", secretValues["REF_STAGING"], "should expand from staging import")

		// Shared key - local wins
		assert.Equal(t, "dev-shared-value", secretValues["REF_SHARED"], "local should override imports")

		// Import priority - last import wins when key absent locally (later overrides earlier)
		assert.Equal(t, "from-second-import", secretValues["REF_IMPORT_PRIORITY"], "last import should win over first import")

		// Service from staging/services import
		assert.Equal(t, "https://staging-service.example.com", secretValues["REF_SERVICE"], "should expand from staging/services import")

		// Prod secret via staging import chain
		assert.Equal(t, "prod-db.example.com", secretValues["REF_PROD_VIA_STAGING"], "should expand from prod via staging import")

		// Multiple refs
		assert.Equal(t, "host=prod-db.example.com&api=https://staging-api.example.com", secretValues["REF_CHAIN"], "multiple refs should expand")

		// Missing ref
		assert.Empty(t, secretValues["REF_MISSING"], "missing ref should be empty")

		// Verify imports present
		assert.GreaterOrEqual(t, len(result.Imports), 2, "should have multiple imports")
	})

	// Test folder level expansion with folder import
	t.Run("folder level expansion with folder import", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/app",
			ViewSecretValue:        true,
			IncludeImports:         true,
			ExpandSecretReferences: true,
		})

		require.NoError(t, err)

		secretValues := make(map[string]string)
		for _, s := range result.Secrets {
			secretValues[s.SecretKey] = s.SecretValue
		}

		// Direct secret in /app
		assert.Equal(t, "app-config", secretValues["APP_CONFIG"], "direct secret should be present")

		// Reference that expands from folder-level import (prod/config into dev/app)
		assert.Equal(t, "postgres://prod-db.example.com:5432/app", secretValues["APP_DB_URL"],
			"should expand using folder-level import from prod/config")

		// Verify folder import present
		require.Len(t, result.Imports, 1, "should have 1 folder import")
		assert.Equal(t, "prod", result.Imports[0].Environment)
		assert.Equal(t, "/config", result.Imports[0].SecretPath)
	})
}

// =============================================================================
// Secret Expansion Tests
// =============================================================================

func TestListSecrets_NestedExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-nested-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PORT", "5432", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:${PORT}", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "FULL_URL", "https://${ENDPOINT}/api", nil)

	identity := nodejs.CreateIdentity(t, "expansion-nested-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

	nodejs.CreateSecret(t, proj.ID, "shared", "/", "SHARED_API_KEY", "shared-api-key-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "MY_API_KEY", "${shared.SHARED_API_KEY}", nil)

	identity := nodejs.CreateIdentity(t, "expansion-cross-env-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/common", "COMMON_SECRET", "common-value", nil)
	// Reference format is ${env.path.path.KEY} where path segments use . not /
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "${dev.common.COMMON_SECRET}", nil)

	identity := nodejs.CreateIdentity(t, "expansion-cross-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

func TestListSecrets_NoExpansion_PreservesReferences(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "no-expansion-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "BASE_VALUE", "base", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "REF_VALUE", "${BASE_VALUE}", nil)

	identity := nodejs.CreateIdentity(t, "no-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_SECRET", "root-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1", "LEVEL1_SECRET", "level1-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1/level2", "LEVEL2_SECRET", "level2-value", nil)

	identity := nodejs.CreateIdentity(t, "recursive-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_ONLY", "root-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/subfolder", "SUB_SECRET", "sub-value", nil)

	identity := nodejs.CreateIdentity(t, "non-recursive-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/api", "API_SECRET", "api-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/web", "WEB_SECRET", "web-value", nil)

	identity := nodejs.CreateIdentity(t, "specific-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	_, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/nonexistent/path",
		ViewSecretValue: true,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

// =============================================================================
// Comment, Metadata, and Personal Override Tests
// =============================================================================

func TestListSecrets_ReturnsComment(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "comment-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "SECRET_WITH_COMMENT", "secret-value", &infra.CreateSecretOpts{
		Comment: "This is a test comment for the secret",
	})

	identity := nodejs.CreateIdentity(t, "comment-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "SECRET_WITH_COMMENT", result.Secrets[0].SecretKey)
	assert.Equal(t, "secret-value", result.Secrets[0].SecretValue)
	assert.Equal(t, "This is a test comment for the secret", result.Secrets[0].SecretComment)
}

func TestListSecrets_ReturnsMetadata(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "metadata-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "SECRET_WITH_METADATA", "secret-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{
			{Key: "owner", Value: "platform-team"},
			{Key: "sensitivity", Value: "high"},
		},
	})

	identity := nodejs.CreateIdentity(t, "metadata-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "SECRET_WITH_METADATA", result.Secrets[0].SecretKey)

	require.Len(t, result.Secrets[0].SecretMetadata, 2)
	metadataMap := make(map[string]string)
	for _, m := range result.Secrets[0].SecretMetadata {
		metadataMap[m.Key] = m.Value
	}
	assert.Equal(t, "platform-team", metadataMap["owner"])
	assert.Equal(t, "high", metadataMap["sensitivity"])
}

func TestListSecretsV4_PersonalOverrides_NeverInclude(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create project (both bootstrap user and identity are auto-added as admin)
	proj := nodejs.CreateProject(t, "personal-v4-never")

	// Create a shared secret first (personal secrets are overrides of shared secrets)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "shared-value", nil)

	// Create a personal override as bootstrap user
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "personal-value", &infra.CreateSecretOpts{
		Type: "personal",
	})

	// V4 default: IncludePersonalOverrides=false -> NeverInclude behavior (only shared)
	svc := newSecretsService(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      permission.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.ListSecretsV4(ctx, &gensecrets.ListSecretsV4Payload{
		ProjectID:                proj.ID,
		Environment:              proj.EnvSlug,
		SecretPath:               "/",
		ViewSecretValue:          true,
		IncludePersonalOverrides: false, // default behavior
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1, "v4 default should only return shared secrets")
	assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
	assert.Equal(t, "shared-value", result.Secrets[0].SecretValue, "should see shared value when personal overrides disabled")
}

func TestListSecretsV4_PersonalOverrides_Priority(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create project (both bootstrap user and identity are auto-added as admin)
	proj := nodejs.CreateProject(t, "personal-v4-priority")

	// Create a shared secret first
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "shared-value", nil)

	// Create a personal override as bootstrap user
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "personal-value", &infra.CreateSecretOpts{
		Type: "personal",
	})

	// V4 with IncludePersonalOverrides=true -> Priority behavior (personal wins)
	svc := newSecretsService(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      permission.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.ListSecretsV4(ctx, &gensecrets.ListSecretsV4Payload{
		ProjectID:                proj.ID,
		Environment:              proj.EnvSlug,
		SecretPath:               "/",
		ViewSecretValue:          true,
		IncludePersonalOverrides: true, // Priority behavior
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1, "v4 with personal overrides should return 1 secret (priority)")
	assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
	assert.Equal(t, "personal-value", result.Secrets[0].SecretValue, "personal override should take precedence")
}

func TestListSecretsV3_PersonalOverrides_IncludeAll(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create project (both bootstrap user and identity are auto-added as admin)
	proj := nodejs.CreateProject(t, "personal-v3-all")

	// Create a shared secret first
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "shared-value", nil)

	// Create a personal override as bootstrap user
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "personal-value", &infra.CreateSecretOpts{
		Type: "personal",
	})

	// V3: Always returns both shared and personal secrets
	svc := newSecretsService(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      permission.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.ListSecretsV3(ctx, &gensecrets.ListSecretsV3Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 2, "v3 should return both shared and personal secrets")

	values := make(map[string]string)
	for _, s := range result.Secrets {
		values[s.Type] = s.SecretValue
	}
	assert.Equal(t, "shared-value", values["shared"], "should have shared secret")
	assert.Equal(t, "personal-value", values["personal"], "should have personal secret")
}

func TestListSecretsV4_PersonalSecretHiddenFromIdentity(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create project (both bootstrap user and identity are auto-added as admin)
	proj := nodejs.CreateProject(t, "personal-hidden-test")

	// Create another identity and add it to project so we can list secrets as this identity
	identity := nodejs.CreateIdentity(t, "personal-hidden-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Create a shared secret first (personal secrets are overrides of shared secrets)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "shared-value", nil)

	// Create a personal override as bootstrap user
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "personal-value", &infra.CreateSecretOpts{
		Type: "personal",
	})

	// List as a different identity - identities can't have personal secrets, so they see shared
	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:                proj.ID,
		Environment:              proj.EnvSlug,
		SecretPath:               "/",
		ViewSecretValue:          true,
		IncludePersonalOverrides: true, // Even with flag, identity sees shared (no personal secrets for identities)
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1, "identity should see the shared secret")
	assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
	assert.Equal(t, "shared-value", result.Secrets[0].SecretValue, "identity should see shared value")
}

func TestListSecrets_CommentAndMetadataTogether(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "comment-metadata-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "FULL_SECRET", "full-value", &infra.CreateSecretOpts{
		Comment: "A secret with both comment and metadata",
		Metadata: []infra.SecretMetadataEntry{
			{Key: "env", Value: "production"},
		},
	})

	identity := nodejs.CreateIdentity(t, "comment-metadata-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)

	secret := result.Secrets[0]
	assert.Equal(t, "FULL_SECRET", secret.SecretKey)
	assert.Equal(t, "full-value", secret.SecretValue)
	assert.Equal(t, "A secret with both comment and metadata", secret.SecretComment)
	require.Len(t, secret.SecretMetadata, 1)
	assert.Equal(t, "env", secret.SecretMetadata[0].Key)
	assert.Equal(t, "production", secret.SecretMetadata[0].Value)
}
