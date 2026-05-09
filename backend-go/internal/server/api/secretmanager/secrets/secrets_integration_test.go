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
	"github.com/infisical/api/internal/queue"
	"github.com/infisical/api/internal/server/api/secretmanager/secrets"
	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services"
	"github.com/infisical/api/internal/services/auditlog"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/kms"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/project"
	smShared "github.com/infisical/api/internal/services/secretmanager"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
)

var (
	stack       *infra.Stack
	testProject *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups").
		MustStart()

	testProject = stack.NodeJS().MustCreateProject("secrets-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// newSecretsHandler creates a secrets handler for direct testing.
func newSecretsHandler(t *testing.T) gensecrets.Service {
	t.Helper()

	permDAL := permission.NewDAL(stack.DB())
	permSvc := permission.NewService(testutil.NopLogger(), permission.Deps{DAL: permDAL})

	authenticator := auth.NewAuthenticator(stack.DB(), infra.AuthSecret)

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

	projectDAL := project.NewDAL(stack.DB())
	projectSvc := project.NewService(testutil.NopLogger(), project.Deps{DAL: projectDAL})

	queueSvc := queue.NewService(testutil.NopLogger(), redisClient)

	// Build shared services struct for handler
	sharedSvc := &services.Services{
		Config:        stack.Config(),
		Authenticator: authenticator,
		Permission:    permSvc,
		KMS:           kmsSvc,
		Project:       projectSvc,
		AuditLog:      auditlog.NewService(testutil.NopLogger(), auditlog.Deps{Queue: queueSvc, Config: stack.Config()}),
	}

	secretManagerSvc := smShared.NewServices(smShared.ServicesDeps{DB: stack.DB()})

	return secrets.NewHandler(secrets.Deps{
		Logger:           testutil.NopLogger(),
		SharedSvc:        sharedSvc,
		SecretManagerSvc: secretManagerSvc,
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

	svc := newSecretsHandler(t)
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
	svc := newSecretsHandler(t)
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
	svc := newSecretsHandler(t)
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

func TestListSecrets_FilterByTagSlugs(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "tag-filter-test")
	tag1 := nodejs.CreateTag(t, proj.ID, "api", "API", "#FF0000")
	tag2 := nodejs.CreateTag(t, proj.ID, "database", "Database", "#00FF00")

	// Create secrets with different tags
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "API_KEY", "api-key-value", &infra.CreateSecretOpts{TagIDs: []string{tag1.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DB_PASSWORD", "db-password", &infra.CreateSecretOpts{TagIDs: []string{tag2.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "UNTAGGED_SECRET", "untagged-value", nil)

	identity := nodejs.CreateIdentity(t, "tag-filter-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Filter by "api" tag - should only return API_KEY
	tagSlugs := "api"
	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
		TagSlugs:        &tagSlugs,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "API_KEY", result.Secrets[0].SecretKey)
}

func TestListSecrets_FilterByMultipleTagSlugs(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "multi-tag-filter-test")
	tag1 := nodejs.CreateTag(t, proj.ID, "api", "API", "#FF0000")
	tag2 := nodejs.CreateTag(t, proj.ID, "database", "Database", "#00FF00")

	// Create secrets with different tags
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "API_KEY", "api-key-value", &infra.CreateSecretOpts{TagIDs: []string{tag1.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DB_PASSWORD", "db-password", &infra.CreateSecretOpts{TagIDs: []string{tag2.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "UNTAGGED_SECRET", "untagged-value", nil)

	identity := nodejs.CreateIdentity(t, "multi-tag-filter-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Filter by "api,database" tags - should return both API_KEY and DB_PASSWORD
	tagSlugs := "api,database"
	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
		TagSlugs:        &tagSlugs,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 2)

	keys := make([]string, len(result.Secrets))
	for i, s := range result.Secrets {
		keys[i] = s.SecretKey
	}
	assert.Contains(t, keys, "API_KEY")
	assert.Contains(t, keys, "DB_PASSWORD")
}

func TestListSecrets_FilterByMetadata(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "metadata-filter-test")

	// Create secrets with different metadata
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PROD_SECRET", "prod-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{{Key: "env", Value: "production"}},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DEV_SECRET", "dev-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{{Key: "env", Value: "development"}},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "NO_METADATA", "no-meta-value", nil)

	identity := nodejs.CreateIdentity(t, "metadata-filter-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Filter by metadata key=env,value=production - should only return PROD_SECRET
	metadataFilter := "key=env,value=production"
	result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
		MetadataFilter:  &metadataFilter,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "PROD_SECRET", result.Secrets[0].SecretKey)
}

// =============================================================================
// Consolidated Test - Single Setup, Multiple Subtests
// =============================================================================

// TestListSecrets_Comprehensive creates a project with diverse secret types and
// runs subtests to verify all filtering, expansion, and behavior modes.
// This is more efficient than separate tests since setup happens once.
func TestListSecrets_Comprehensive(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create project with all the infrastructure we need
	proj := nodejs.CreateProject(t, "comprehensive-test")

	// Create tags
	tagAPI := nodejs.CreateTag(t, proj.ID, "api", "API", "#FF0000")
	tagDB := nodejs.CreateTag(t, proj.ID, "database", "Database", "#00FF00")
	tagSensitive := nodejs.CreateTag(t, proj.ID, "sensitive", "Sensitive", "#0000FF")

	// Create folders
	nodejs.CreateFolder(t, proj.ID, "dev", "/", "config")
	nodejs.CreateFolder(t, proj.ID, "dev", "/config", "nested")

	// Create diverse secrets in root folder
	// 1. Plain secret
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "PLAIN_SECRET", "plain-value", nil)

	// 2. Secret with comment
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "COMMENTED_SECRET", "commented-value", &infra.CreateSecretOpts{
		Comment: "This is a comment for the secret",
	})

	// 3. Secret with single tag
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "API_KEY", "api-key-value", &infra.CreateSecretOpts{
		TagIDs: []string{tagAPI.ID},
	})

	// 4. Secret with multiple tags
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DB_PASSWORD", "db-password-value", &infra.CreateSecretOpts{
		TagIDs: []string{tagDB.ID, tagSensitive.ID},
	})

	// 5. Secret with metadata
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "PROD_CONFIG", "prod-config-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{
			{Key: "env", Value: "production"},
			{Key: "owner", Value: "platform-team"},
		},
	})

	// 6. Secret with different metadata value (same key)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_CONFIG", "dev-config-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{{Key: "env", Value: "development"}},
	})

	// 7. Base secrets for expansion tests
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "PORT", "5432", nil)

	// 8. Secret with local reference
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "ENDPOINT", "${HOST}:${PORT}", nil)

	// 9. Secret with nested reference
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "FULL_URL", "https://${ENDPOINT}/api", nil)

	// 10. Secret with missing reference
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_MISSING", "${NOT_EXISTS}", nil)

	// 11. Secrets in subfolder for recursive tests
	nodejs.CreateSecret(t, proj.ID, "dev", "/config", "CONFIG_SECRET", "config-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/config/nested", "NESTED_SECRET", "nested-value", nil)

	// 12. Shared secret for personal override test
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "OVERRIDEABLE", "shared-overrideable", nil)

	// 13. Personal override as bootstrap user
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "OVERRIDEABLE", "personal-overrideable", &infra.CreateSecretOpts{
		Type: "personal",
	})

	// Create staging environment with secrets for import tests
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_DB", "staging-db-value", nil)

	// Create import from staging to dev
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	// Create cross-env secret reference
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "CROSS_ENV_REF", "${staging.STAGING_SECRET}", nil)

	// Create cross-path secret reference
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "CROSS_PATH_REF", "${dev.config.CONFIG_SECRET}", nil)

	// Create identity for identity-based tests
	identity := nodejs.CreateIdentity(t, "comprehensive-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Helper to list secrets as identity
	listAsIdentity := func(t *testing.T, payload *gensecrets.ListSecretsV4Payload) *gensecrets.ListSecretsResult {
		t.Helper()
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), payload)
		require.NoError(t, err)
		return result
	}

	// Helper to get secret by key from results
	getSecretByKey := func(secrets []*gensecrets.SecretRaw, key string) *gensecrets.SecretRaw {
		for _, s := range secrets {
			if s.SecretKey == key {
				return s
			}
		}
		return nil
	}

	// ===================
	// Basic Operation Subtests
	// ===================

	t.Run("returns correct structure", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		secret := getSecretByKey(result.Secrets, "PLAIN_SECRET")
		require.NotNil(t, secret, "PLAIN_SECRET should exist")
		assert.NotEmpty(t, secret.ID)
		assert.Equal(t, "PLAIN_SECRET", secret.SecretKey)
		assert.Equal(t, "plain-value", secret.SecretValue)
		assert.Equal(t, "dev", secret.Environment)
		assert.NotEmpty(t, secret.Workspace)
		assert.NotEmpty(t, secret.CreatedAt)
		assert.NotEmpty(t, secret.UpdatedAt)
		assert.Equal(t, 1, secret.Version)
		assert.Equal(t, "shared", secret.Type)
	})

	t.Run("returns comment", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		secret := getSecretByKey(result.Secrets, "COMMENTED_SECRET")
		require.NotNil(t, secret)
		assert.Equal(t, "This is a comment for the secret", secret.SecretComment)
	})

	t.Run("returns metadata", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		secret := getSecretByKey(result.Secrets, "PROD_CONFIG")
		require.NotNil(t, secret)
		require.Len(t, secret.SecretMetadata, 2)

		metadataMap := make(map[string]string)
		for _, m := range secret.SecretMetadata {
			metadataMap[m.Key] = m.Value
		}
		assert.Equal(t, "production", metadataMap["env"])
		assert.Equal(t, "platform-team", metadataMap["owner"])
	})

	t.Run("returns tags", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		secret := getSecretByKey(result.Secrets, "DB_PASSWORD")
		require.NotNil(t, secret)
		require.Len(t, secret.Tags, 2)

		tagSlugs := make([]string, len(secret.Tags))
		for i, tag := range secret.Tags {
			tagSlugs[i] = tag.Slug
		}
		assert.Contains(t, tagSlugs, "database")
		assert.Contains(t, tagSlugs, "sensitive")
	})

	// ===================
	// Filtering Subtests
	// ===================

	t.Run("filter by single tag slug", func(t *testing.T) {
		tagSlugs := "api"
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			TagSlugs:        &tagSlugs,
		})

		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "API_KEY", result.Secrets[0].SecretKey)
	})

	t.Run("filter by multiple tag slugs (OR logic)", func(t *testing.T) {
		tagSlugs := "api,database"
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			TagSlugs:        &tagSlugs,
		})

		require.Len(t, result.Secrets, 2)
		keys := make([]string, len(result.Secrets))
		for i, s := range result.Secrets {
			keys[i] = s.SecretKey
		}
		assert.Contains(t, keys, "API_KEY")
		assert.Contains(t, keys, "DB_PASSWORD")
	})

	t.Run("filter by metadata", func(t *testing.T) {
		metadataFilter := "key=env,value=production"
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			MetadataFilter:  &metadataFilter,
		})

		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "PROD_CONFIG", result.Secrets[0].SecretKey)
	})

	// ===================
	// Recursive Subtests
	// ===================

	t.Run("recursive includes subfolders", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			Recursive:       true,
			IncludeImports:  false, // Exclude imports to just test folder recursion
		})

		keys := make([]string, len(result.Secrets))
		for i, s := range result.Secrets {
			keys[i] = s.SecretKey
		}
		assert.Contains(t, keys, "PLAIN_SECRET", "should include root secrets")
		assert.Contains(t, keys, "CONFIG_SECRET", "should include /config secrets")
		assert.Contains(t, keys, "NESTED_SECRET", "should include /config/nested secrets")
	})

	t.Run("non-recursive excludes subfolders", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			Recursive:       false,
			IncludeImports:  false,
		})

		for _, s := range result.Secrets {
			assert.NotEqual(t, "CONFIG_SECRET", s.SecretKey, "should not include /config secrets")
			assert.NotEqual(t, "NESTED_SECRET", s.SecretKey, "should not include /config/nested secrets")
		}
	})

	// ===================
	// Import Subtests
	// ===================

	t.Run("include imports returns imported secrets", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  true,
		})

		require.NotNil(t, result.Imports, "imports should be present")
		require.GreaterOrEqual(t, len(result.Imports), 1, "should have at least one import")

		var foundStaging bool
		for _, imp := range result.Imports {
			if imp.Environment != "staging" {
				continue
			}
			foundStaging = true
			importKeys := make([]string, len(imp.Secrets))
			for i, s := range imp.Secrets {
				importKeys[i] = s.SecretKey
			}
			assert.Contains(t, importKeys, "STAGING_SECRET")
			assert.Contains(t, importKeys, "STAGING_DB")
		}
		assert.True(t, foundStaging, "should have staging import")
	})

	t.Run("exclude imports omits imported secrets", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  false,
		})

		assert.Nil(t, result.Imports, "imports should not be included")
	})

	// ===================
	// Expansion Subtests
	// ===================

	t.Run("expands local references", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		secret := getSecretByKey(result.Secrets, "ENDPOINT")
		require.NotNil(t, secret)
		assert.Equal(t, "myhost.com:5432", secret.SecretValue)
	})

	t.Run("expands nested references", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		secret := getSecretByKey(result.Secrets, "FULL_URL")
		require.NotNil(t, secret)
		assert.Equal(t, "https://myhost.com:5432/api", secret.SecretValue)
	})

	t.Run("expands cross-environment references", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		secret := getSecretByKey(result.Secrets, "CROSS_ENV_REF")
		require.NotNil(t, secret)
		assert.Equal(t, "staging-value", secret.SecretValue)
	})

	t.Run("expands cross-path references", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		secret := getSecretByKey(result.Secrets, "CROSS_PATH_REF")
		require.NotNil(t, secret)
		assert.Equal(t, "config-value", secret.SecretValue)
	})

	t.Run("missing references resolve to empty", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		secret := getSecretByKey(result.Secrets, "REF_MISSING")
		require.NotNil(t, secret)
		assert.Empty(t, secret.SecretValue, "missing ref should be empty")
	})

	t.Run("no expansion preserves references", func(t *testing.T) {
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: false,
		})

		secret := getSecretByKey(result.Secrets, "ENDPOINT")
		require.NotNil(t, secret)
		assert.Equal(t, "${HOST}:${PORT}", secret.SecretValue, "reference should NOT be expanded")
	})

	// ===================
	// Personal Override Subtests
	// ===================

	t.Run("v4 default excludes personal overrides", func(t *testing.T) {
		// Identity-based: always sees shared (identities can't have personal secrets)
		result := listAsIdentity(t, &gensecrets.ListSecretsV4Payload{
			ProjectID:                proj.ID,
			Environment:              "dev",
			SecretPath:               "/",
			ViewSecretValue:          true,
			IncludePersonalOverrides: false,
		})

		secret := getSecretByKey(result.Secrets, "OVERRIDEABLE")
		require.NotNil(t, secret)
		assert.Equal(t, "shared-overrideable", secret.SecretValue)
	})

	t.Run("v4 with personal overrides for user (priority)", func(t *testing.T) {
		// Test as user, not identity
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      permission.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		result, err := svc.ListSecretsV4(ctx, &gensecrets.ListSecretsV4Payload{
			ProjectID:                proj.ID,
			Environment:              "dev",
			SecretPath:               "/",
			ViewSecretValue:          true,
			IncludePersonalOverrides: true,
		})
		require.NoError(t, err)

		secret := getSecretByKey(result.Secrets, "OVERRIDEABLE")
		require.NotNil(t, secret)
		assert.Equal(t, "personal-overrideable", secret.SecretValue, "personal override should take precedence")
	})

	// ===================
	// V3 Raw Endpoint Subtests
	// ===================

	t.Run("v3 raw with workspaceSlug resolves project", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      permission.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		env := "dev"
		result, err := svc.ListSecretsRawV3(ctx, &gensecrets.ListSecretsRawV3Payload{
			WorkspaceSlug:   &proj.Slug,
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)

		// Should have secrets from the project
		assert.NotEmpty(t, result.Secrets, "should return secrets when using workspaceSlug")
		secret := getSecretByKey(result.Secrets, "PLAIN_SECRET")
		require.NotNil(t, secret)
		assert.Equal(t, "plain-value", secret.SecretValue)
	})

	t.Run("v3 raw with workspaceId works", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      permission.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		env := "dev"
		result, err := svc.ListSecretsRawV3(ctx, &gensecrets.ListSecretsRawV3Payload{
			WorkspaceID:     &proj.ID,
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)

		// Should have secrets from the project
		assert.NotEmpty(t, result.Secrets, "should return secrets when using workspaceId")
		secret := getSecretByKey(result.Secrets, "PLAIN_SECRET")
		require.NotNil(t, secret)
		assert.Equal(t, "plain-value", secret.SecretValue)
	})

	t.Run("v3 raw requires workspaceId or workspaceSlug", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      permission.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		env := "dev"
		_, err := svc.ListSecretsRawV3(ctx, &gensecrets.ListSecretsRawV3Payload{
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "workspaceId or workspaceSlug")
	})

	// ===================
	// Get Secret By Name Subtests
	// ===================

	t.Run("get secret by name v4 returns secret", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeIdentityAccessToken,
			Actor:      permission.ActorTypeIdentity,
			ActorID:    uuid.MustParse(identity.ID),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		getResult, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "PLAIN_SECRET",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)
		assert.Equal(t, "PLAIN_SECRET", getResult.Secret.SecretKey)
		assert.Equal(t, "plain-value", getResult.Secret.SecretValue)
	})

	t.Run("get secret by name v4 with expansion", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeIdentityAccessToken,
			Actor:      permission.ActorTypeIdentity,
			ActorID:    uuid.MustParse(identity.ID),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		getResult, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:             "ENDPOINT",
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})
		require.NoError(t, err)
		assert.Equal(t, "ENDPOINT", getResult.Secret.SecretKey)
		assert.Equal(t, "myhost.com:5432", getResult.Secret.SecretValue, "should expand references")
	})

	t.Run("get secret by name v4 without expansion", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeIdentityAccessToken,
			Actor:      permission.ActorTypeIdentity,
			ActorID:    uuid.MustParse(identity.ID),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		getResult, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:             "ENDPOINT",
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: false,
		})
		require.NoError(t, err)
		assert.Equal(t, "ENDPOINT", getResult.Secret.SecretKey)
		assert.Equal(t, "${HOST}:${PORT}", getResult.Secret.SecretValue, "should not expand references")
	})

	t.Run("get secret by name v4 not found", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeIdentityAccessToken,
			Actor:      permission.ActorTypeIdentity,
			ActorID:    uuid.MustParse(identity.ID),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		_, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "NON_EXISTENT_SECRET",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("get secret by name v4 with comment and metadata", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeIdentityAccessToken,
			Actor:      permission.ActorTypeIdentity,
			ActorID:    uuid.MustParse(identity.ID),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		// Get secret with comment
		getResult, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "COMMENTED_SECRET",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)
		assert.Equal(t, "COMMENTED_SECRET", getResult.Secret.SecretKey)
		assert.Equal(t, "This is a comment for the secret", getResult.Secret.SecretComment)

		// Get secret with metadata
		getResult2, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "PROD_CONFIG",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)
		assert.Equal(t, "PROD_CONFIG", getResult2.Secret.SecretKey)
		require.NotEmpty(t, getResult2.Secret.SecretMetadata)
	})

	t.Run("get secret by name v3 raw with workspaceSlug", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      permission.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		env := "dev"
		getResult, err := svc.GetSecretByNameRawV3(ctx, &gensecrets.GetSecretByNameRawV3Payload{
			SecretName:      "PLAIN_SECRET",
			WorkspaceSlug:   &proj.Slug,
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})
		require.NoError(t, err)
		assert.Equal(t, "PLAIN_SECRET", getResult.Secret.SecretKey)
		assert.Equal(t, "plain-value", getResult.Secret.SecretValue)
	})
}
