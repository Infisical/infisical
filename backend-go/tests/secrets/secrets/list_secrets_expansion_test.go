//go:build integration

package secrets_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
)

// The expansion algorithm (circular refs, self-reference, max depth, chained
// absolute refs, import ordering) is covered by the unit tests in
// internal/services/secrets/secret/expansion_test.go. These integration tests
// cover the end-to-end wiring: expansion and imports resolved through the real
// handler, DB, and permission layer for a full list response.

func TestListSecrets_Imports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-imports")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_DB_URL", "staging-db-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_API_KEY", "staging-api-value", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "list-imports-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	t.Run("include imports returns imported secrets", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(true),
		})
		require.NoError(t, err)

		require.Len(t, resp.Secrets, 1)
		assert.Equal(t, "DEV_SECRET", resp.Secrets[0].SecretKey)

		require.Len(t, resp.Imports, 1)
		assert.Equal(t, "staging", resp.Imports[0].Environment)
		assert.Equal(t, "/", resp.Imports[0].SecretPath)
		require.Len(t, resp.Imports[0].Secrets, 2)

		importKeys := make([]string, len(resp.Imports[0].Secrets))
		for i, s := range resp.Imports[0].Secrets {
			importKeys[i] = s.SecretKey
		}
		assert.Contains(t, importKeys, "STAGING_DB_URL")
		assert.Contains(t, importKeys, "STAGING_API_KEY")
	})

	t.Run("exclude imports omits imported secrets", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(false),
		})
		require.NoError(t, err)

		require.Len(t, resp.Secrets, 1)
		assert.Equal(t, "DEV_SECRET", resp.Secrets[0].SecretKey)
		assert.Nil(t, resp.Imports, "imports should not be included when IncludeImports=false")
	})
}

func TestListSecrets_Expansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-expansion")
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

	identity := nodejs.CreateIdentity(t, "list-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	expanded := func(t *testing.T) []secret.SecretRaw {
		t.Helper()
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             new("/"),
			ViewSecretValue:        new(true),
			ExpandSecretReferences: new(true),
		})
		require.NoError(t, err)
		return resp.Secrets
	}

	t.Run("nested expansion", func(t *testing.T) {
		secrets := expanded(t)

		endpoint := findSecret(secrets, "ENDPOINT")
		require.NotNil(t, endpoint)
		assert.Equal(t, "myhost.com:5432", endpoint.SecretValue)

		fullURL := findSecret(secrets, "FULL_URL")
		require.NotNil(t, fullURL)
		assert.Equal(t, "https://myhost.com:5432/api", fullURL.SecretValue)
	})

	t.Run("cross environment expansion", func(t *testing.T) {
		secretItem := findSecret(expanded(t), "CROSS_ENV_REF")
		require.NotNil(t, secretItem)
		assert.Equal(t, "shared-api-key-value", secretItem.SecretValue)
	})

	t.Run("cross path expansion", func(t *testing.T) {
		secretItem := findSecret(expanded(t), "CROSS_PATH_REF")
		require.NotNil(t, secretItem)
		assert.Equal(t, "common-value", secretItem.SecretValue)
	})

	t.Run("no expansion preserves references", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:              proj.ID,
			Environment:            proj.EnvSlug,
			SecretPath:             new("/"),
			ViewSecretValue:        new(true),
			ExpandSecretReferences: new(false),
		})
		require.NoError(t, err)

		secretItem := findSecret(resp.Secrets, "REF_VALUE")
		require.NotNil(t, secretItem)
		assert.Equal(t, "${BASE_VALUE}", secretItem.SecretValue, "reference should NOT be expanded")
	})
}

// TestListSecrets_ExpansionWithImports exercises expansion that resolves through
// multiple imports, including import priority (last import wins), local override
// of imports, and folder-level imports.
func TestListSecrets_ExpansionWithImports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-expansion-imports")

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

	identity := nodejs.CreateIdentity(t, "list-expansion-imports-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	t.Run("root level expansion", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             new("/"),
			ViewSecretValue:        new(true),
			IncludeImports:         new(true),
			ExpandSecretReferences: new(true),
		})
		require.NoError(t, err)

		secretValues := make(map[string]string)
		for _, s := range resp.Secrets {
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
		assert.GreaterOrEqual(t, len(resp.Imports), 2, "should have multiple imports")
	})

	t.Run("folder level expansion with folder import", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:              proj.ID,
			Environment:            "dev",
			SecretPath:             new("/app"),
			ViewSecretValue:        new(true),
			IncludeImports:         new(true),
			ExpandSecretReferences: new(true),
		})
		require.NoError(t, err)

		secretValues := make(map[string]string)
		for _, s := range resp.Secrets {
			secretValues[s.SecretKey] = s.SecretValue
		}

		assert.Equal(t, "app-config", secretValues["APP_CONFIG"], "direct secret should be present")
		assert.Equal(t, "postgres://prod-db.example.com:5432/app", secretValues["APP_DB_URL"],
			"should expand using folder-level import from prod/config")

		require.Len(t, resp.Imports, 1, "should have 1 folder import")
		assert.Equal(t, "prod", resp.Imports[0].Environment)
		assert.Equal(t, "/config", resp.Imports[0].SecretPath)
	})
}
