//go:build integration

package secret_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/testutil/infra"
)

func TestListSecrets_Basic(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "basic-test")

	tag1 := nodejs.CreateTag(t, proj.ID, "env-prod", "Production", "#FF0000")
	tag2 := nodejs.CreateTag(t, proj.ID, "sensitive", "Sensitive", "#0000FF")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PLAIN_SECRET", "plain-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENCRYPTED_SECRET", "decrypted-correctly", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TAGGED_SECRET", "tagged-value", &infra.CreateSecretOpts{TagIDs: []string{tag1.ID, tag2.ID}})

	identity := nodejs.CreateIdentity(t, "basic-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	getSecretByKey := func(secrets []*gensecrets.SecretRaw, key string) *gensecrets.SecretRaw {
		for _, s := range secrets {
			if s.SecretKey == key {
				return s
			}
		}
		return nil
	}

	t.Run("returns correct structure", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "PLAIN_SECRET")
		require.NotNil(t, secret)

		assert.NotEmpty(t, secret.ID)
		assert.Equal(t, "PLAIN_SECRET", secret.SecretKey)
		assert.Equal(t, "plain-value", secret.SecretValue)
		assert.Equal(t, proj.EnvSlug, secret.Environment)
		assert.NotEmpty(t, secret.Workspace)
		assert.NotEmpty(t, secret.CreatedAt)
		assert.NotEmpty(t, secret.UpdatedAt)
		assert.Equal(t, 1, secret.Version)
		assert.Equal(t, "shared", secret.Type)
	})

	t.Run("decrypts values", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "ENCRYPTED_SECRET")
		require.NotNil(t, secret)
		assert.Equal(t, "decrypted-correctly", secret.SecretValue)
	})

	t.Run("includes tags", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "TAGGED_SECRET")
		require.NotNil(t, secret)
		require.Len(t, secret.Tags, 2)

		tagSlugs := make([]string, len(secret.Tags))
		for i, tag := range secret.Tags {
			tagSlugs[i] = tag.Slug
		}
		assert.Contains(t, tagSlugs, "env-prod")
		assert.Contains(t, tagSlugs, "sensitive")
	})

	t.Run("returns multiple secrets", func(t *testing.T) {
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
		assert.Contains(t, keys, "PLAIN_SECRET")
		assert.Contains(t, keys, "ENCRYPTED_SECRET")
		assert.Contains(t, keys, "TAGGED_SECRET")
	})
}

func TestListSecrets_Imports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "imports-test")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_DB_URL", "staging-db-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_KEY", "staging-api-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "imports-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	t.Run("include imports returns imported secrets", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "DEV_SECRET", result.Secrets[0].SecretKey)

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
	})

	t.Run("exclude imports omits imported secrets", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  false,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "DEV_SECRET", result.Secrets[0].SecretKey)
		assert.Nil(t, result.Imports, "imports should not be included when IncludeImports=false")
	})
}

func TestListSecrets_ExpansionWithImports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-imports-test")

	nodejs.CreateFolder(t, proj.ID, "prod", "/", "config")
	nodejs.CreateFolder(t, proj.ID, "staging", "/", "services")
	nodejs.CreateFolder(t, proj.ID, "dev", "/", "app")

	nodejs.CreateSecret(t, proj.ID, "prod", "/", "PROD_ROOT", "prod-root", nil)
	nodejs.CreateSecret(t, proj.ID, "prod", "/config", "PROD_DB_HOST", "prod-db.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "prod", "/config", "SHARED_KEY", "prod-shared-value", nil)

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_URL", "https://staging-api.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "SHARED_KEY", "staging-shared-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "IMPORT_PRIORITY_KEY", "from-first-import", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/services", "SERVICE_URL", "https://staging-service.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/services", "IMPORT_PRIORITY_KEY", "from-second-import", nil)
	nodejs.CreateSecretImport(t, proj.ID, "staging", "/", "prod", "/config")

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "LOCAL_SECRET", "local-only", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "SHARED_KEY", "dev-shared-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/app", "APP_CONFIG", "app-config", nil)

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_LOCAL", "${LOCAL_SECRET}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_STAGING", "${STAGING_API_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_SHARED", "${SHARED_KEY}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_SERVICE", "${SERVICE_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_PROD_VIA_STAGING", "${PROD_DB_HOST}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_CHAIN", "host=${PROD_DB_HOST}&api=${STAGING_API_URL}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_MISSING", "${NOT_EXISTS}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "REF_IMPORT_PRIORITY", "${IMPORT_PRIORITY_KEY}", nil)

	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/services")
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/app", "prod", "/config")

	nodejs.CreateSecret(t, proj.ID, "dev", "/app", "APP_DB_URL", "postgres://${PROD_DB_HOST}:5432/app", nil)

	identity := nodejs.CreateIdentity(t, "expansion-imports-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

		assert.Equal(t, "local-only", secretValues["REF_LOCAL"], "should expand from local")
		assert.Equal(t, "https://staging-api.example.com", secretValues["REF_STAGING"], "should expand from staging import")
		assert.Equal(t, "dev-shared-value", secretValues["REF_SHARED"], "local should override imports")
		assert.Equal(t, "from-second-import", secretValues["REF_IMPORT_PRIORITY"], "last import should win over first import")
		assert.Equal(t, "https://staging-service.example.com", secretValues["REF_SERVICE"], "should expand from staging/services import")
		assert.Equal(t, "prod-db.example.com", secretValues["REF_PROD_VIA_STAGING"], "should expand from prod via staging import")
		assert.Equal(t, "host=prod-db.example.com&api=https://staging-api.example.com", secretValues["REF_CHAIN"], "multiple refs should expand")
		assert.Empty(t, secretValues["REF_MISSING"], "missing ref should be empty")
		assert.GreaterOrEqual(t, len(result.Imports), 2, "should have multiple imports")
	})

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

		assert.Equal(t, "app-config", secretValues["APP_CONFIG"], "direct secret should be present")
		assert.Equal(t, "postgres://prod-db.example.com:5432/app", secretValues["APP_DB_URL"],
			"should expand using folder-level import from prod/config")

		require.Len(t, result.Imports, 1, "should have 1 folder import")
		assert.Equal(t, "prod", result.Imports[0].Environment)
		assert.Equal(t, "/config", result.Imports[0].SecretPath)
	})
}

func TestListSecrets_Expansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "expansion-test")
	nodejs.CreateEnvironment(t, proj.ID, "shared", "Shared")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "common")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PORT", "5432", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:${PORT}", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "FULL_URL", "https://${ENDPOINT}/api", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "BASE_VALUE", "base", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "REF_VALUE", "${BASE_VALUE}", nil)

	nodejs.CreateSecret(t, proj.ID, "shared", "/", "SHARED_API_KEY", "shared-api-key-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CROSS_ENV_REF", "${shared.SHARED_API_KEY}", nil)

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/common", "COMMON_SECRET", "common-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "CROSS_PATH_REF", "${dev.common.COMMON_SECRET}", nil)

	identity := nodejs.CreateIdentity(t, "expansion-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	getSecretByKey := func(secrets []*gensecrets.SecretRaw, key string) *gensecrets.SecretRaw {
		for _, s := range secrets {
			if s.SecretKey == key {
				return s
			}
		}
		return nil
	}

	t.Run("nested expansion", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		require.NoError(t, err)

		endpoint := getSecretByKey(result.Secrets, "ENDPOINT")
		require.NotNil(t, endpoint)
		assert.Equal(t, "myhost.com:5432", endpoint.SecretValue)

		fullURL := getSecretByKey(result.Secrets, "FULL_URL")
		require.NotNil(t, fullURL)
		assert.Equal(t, "https://myhost.com:5432/api", fullURL.SecretValue)
	})

	t.Run("cross environment expansion", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "CROSS_ENV_REF")
		require.NotNil(t, secret)
		assert.Equal(t, "shared-api-key-value", secret.SecretValue)
	})

	t.Run("cross path expansion", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "CROSS_PATH_REF")
		require.NotNil(t, secret)
		assert.Equal(t, "common-value", secret.SecretValue)
	})

	t.Run("no expansion preserves references", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             "/",
			ViewSecretValue:        true,
			ExpandSecretReferences: false,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "REF_VALUE")
		require.NotNil(t, secret)
		assert.Equal(t, "${BASE_VALUE}", secret.SecretValue, "reference should NOT be expanded")
	})
}

func TestListSecrets_PathAndRecursive(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "path-recursive-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "level1")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/level1", "level2")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "api")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "web")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROOT_SECRET", "root-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1", "LEVEL1_SECRET", "level1-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/level1/level2", "LEVEL2_SECRET", "level2-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/api", "API_SECRET", "api-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/web", "WEB_SECRET", "web-value", nil)

	identity := nodejs.CreateIdentity(t, "path-recursive-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	t.Run("recursive includes subfolders", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
			Recursive:       true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 5, "recursive should return all secrets from all subfolders")

		keys := make([]string, len(result.Secrets))
		for i, s := range result.Secrets {
			keys[i] = s.SecretKey
		}
		assert.Contains(t, keys, "ROOT_SECRET")
		assert.Contains(t, keys, "LEVEL1_SECRET")
		assert.Contains(t, keys, "LEVEL2_SECRET")
	})

	t.Run("non-recursive only current folder", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
			Recursive:       false,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1, "non-recursive should only return secrets from current folder")
		assert.Equal(t, "ROOT_SECRET", result.Secrets[0].SecretKey)
	})

	t.Run("specific path", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/api",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "API_SECRET", result.Secrets[0].SecretKey)
	})
}

func TestListSecrets_Errors(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "errors-test")

	identity := nodejs.CreateIdentity(t, "errors-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	t.Run("environment not found", func(t *testing.T) {
		_, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     "nonexistent",
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("folder not found", func(t *testing.T) {
		_, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/nonexistent/path",
			ViewSecretValue: true,
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}

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

func TestListSecrets_Metadata(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "metadata-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "SECRET_WITH_METADATA", "secret-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{
			{Key: "owner", Value: "platform-team"},
			{Key: "sensitivity", Value: "high"},
		},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "SECRET_WITH_COMMENT", "full-value", &infra.CreateSecretOpts{
		Comment: "A secret with both comment and metadata",
		Metadata: []infra.SecretMetadataEntry{
			{Key: "env", Value: "production"},
		},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "SECRET_MIXED_ENCRYPTION", "encrypted-meta-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{
			{Key: "plaintext", Value: "plain-value", IsEncrypted: false},
			{Key: "sensitive", Value: "encrypted-value", IsEncrypted: true},
		},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PROD_SECRET", "prod-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{{Key: "env", Value: "production"}},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DEV_SECRET", "dev-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{{Key: "env", Value: "development"}},
	})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "NO_METADATA", "no-meta-value", nil)

	identity := nodejs.CreateIdentity(t, "metadata-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	getSecretByKey := func(secrets []*gensecrets.SecretRaw, key string) *gensecrets.SecretRaw {
		for _, s := range secrets {
			if s.SecretKey == key {
				return s
			}
		}
		return nil
	}

	t.Run("returns metadata fields", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "SECRET_WITH_METADATA")
		require.NotNil(t, secret)

		require.Len(t, secret.SecretMetadata, 2)
		metadataMap := make(map[string]string)
		for _, m := range secret.SecretMetadata {
			metadataMap[m.Key] = m.Value
		}
		assert.Equal(t, "platform-team", metadataMap["owner"])
		assert.Equal(t, "high", metadataMap["sensitivity"])
	})

	t.Run("comment and metadata together", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "SECRET_WITH_COMMENT")
		require.NotNil(t, secret)

		assert.Equal(t, "full-value", secret.SecretValue)
		assert.Equal(t, "A secret with both comment and metadata", secret.SecretComment)
		require.Len(t, secret.SecretMetadata, 1)
		assert.Equal(t, "env", secret.SecretMetadata[0].Key)
		assert.Equal(t, "production", secret.SecretMetadata[0].Value)
	})

	t.Run("encrypted vs plaintext metadata", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		secret := getSecretByKey(result.Secrets, "SECRET_MIXED_ENCRYPTION")
		require.NotNil(t, secret)
		require.Len(t, secret.SecretMetadata, 2)

		metadataMap := make(map[string]*gensecrets.ResourceMetadata)
		for _, m := range secret.SecretMetadata {
			metadataMap[m.Key] = m
		}

		plaintext := metadataMap["plaintext"]
		require.NotNil(t, plaintext)
		assert.Equal(t, "plain-value", plaintext.Value)
		assert.False(t, plaintext.IsEncrypted)

		sensitive := metadataMap["sensitive"]
		require.NotNil(t, sensitive)
		assert.Equal(t, "encrypted-value", sensitive.Value)
		assert.True(t, sensitive.IsEncrypted)
	})

	t.Run("filter by metadata", func(t *testing.T) {
		metadataFilter := "key=env,value=production"
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      "/",
			ViewSecretValue: true,
			MetadataFilter:  &metadataFilter,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 2)

		keys := make([]string, len(result.Secrets))
		for i, s := range result.Secrets {
			keys[i] = s.SecretKey
		}
		assert.Contains(t, keys, "PROD_SECRET")
		assert.Contains(t, keys, "SECRET_WITH_COMMENT")
	})
}

func TestListSecrets_PersonalOverrides(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "personal-test")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "shared-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MY_SECRET", "personal-value", &infra.CreateSecretOpts{
		Type: "personal",
	})

	identity := nodejs.CreateIdentity(t, "personal-test-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	t.Run("never include returns shared only", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      auth.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		result, err := svc.ListSecretsV4(ctx, &gensecrets.ListSecretsV4Payload{
			ProjectID:                proj.ID,
			Environment:              proj.EnvSlug,
			SecretPath:               "/",
			ViewSecretValue:          true,
			IncludePersonalOverrides: false,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
		assert.Equal(t, "shared-value", result.Secrets[0].SecretValue)
	})

	t.Run("priority returns personal override", func(t *testing.T) {
		svc := newSecretsHandler(t)
		ctx := auth.WithIdentity(context.Background(), &auth.Identity{
			AuthMode:   auth.AuthModeJWT,
			Actor:      auth.ActorTypeUser,
			ActorID:    uuid.MustParse(nodejs.UserID()),
			OrgID:      uuid.MustParse(nodejs.OrgID()),
			AuthMethod: "",
		})

		result, err := svc.ListSecretsV4(ctx, &gensecrets.ListSecretsV4Payload{
			ProjectID:                proj.ID,
			Environment:              proj.EnvSlug,
			SecretPath:               "/",
			ViewSecretValue:          true,
			IncludePersonalOverrides: true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
		assert.Equal(t, "personal-value", result.Secrets[0].SecretValue)
	})

	t.Run("identity sees shared value", func(t *testing.T) {
		result, err := listSecretsAsAdmin(t, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
			ProjectID:                proj.ID,
			Environment:              proj.EnvSlug,
			SecretPath:               "/",
			ViewSecretValue:          true,
			IncludePersonalOverrides: true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "MY_SECRET", result.Secrets[0].SecretKey)
		assert.Equal(t, "shared-value", result.Secrets[0].SecretValue)
	})
}

func TestListSecrets_TagFiltering(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "tag-filter-test")
	tag1 := nodejs.CreateTag(t, proj.ID, "api", "API", "#FF0000")
	tag2 := nodejs.CreateTag(t, proj.ID, "database", "Database", "#00FF00")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "API_KEY", "api-key-value", &infra.CreateSecretOpts{TagIDs: []string{tag1.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "DB_PASSWORD", "db-password", &infra.CreateSecretOpts{TagIDs: []string{tag2.ID}})
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "UNTAGGED_SECRET", "untagged-value", nil)

	identity := nodejs.CreateIdentity(t, "tag-filter-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	t.Run("filter by single tag", func(t *testing.T) {
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
	})

	t.Run("filter by multiple tags", func(t *testing.T) {
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
	})
}

func TestListSecretsRawV3(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "v3-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "V3_SECRET", "v3-value", nil)

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      auth.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	t.Run("with workspace slug", func(t *testing.T) {
		env := proj.EnvSlug
		result, err := svc.ListSecretsRawV3(ctx, &gensecrets.ListSecretsRawV3Payload{
			WorkspaceSlug:   &proj.Slug,
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.NoError(t, err)
		require.Len(t, result.Secrets, 1)
		assert.Equal(t, "V3_SECRET", result.Secrets[0].SecretKey)
	})

	t.Run("requires workspace id or slug", func(t *testing.T) {
		env := "dev"
		_, err := svc.ListSecretsRawV3(ctx, &gensecrets.ListSecretsRawV3Payload{
			Environment:     &env,
			SecretPath:      "/",
			ViewSecretValue: true,
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "workspaceId or workspaceSlug")
	})
}
