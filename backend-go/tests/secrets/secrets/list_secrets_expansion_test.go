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

// TestListSecrets_Imports and the import-response structure tests live in
// list_secrets_imports_test.go.

func TestListSecrets_Expansion(t *testing.T) {
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-expansion").Do()
	api.Environments.Create(proj.ID, "shared", "Shared")
	api.Folders.Create(proj.ID, proj.EnvSlug, "/", "common")

	api.Secrets.Create(proj.ID, proj.EnvSlug, "HOST", "myhost.com").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "PORT", "5432").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "ENDPOINT", "${HOST}:${PORT}").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "FULL_URL", "https://${ENDPOINT}/api").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "BASE_VALUE", "base").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "REF_VALUE", "${BASE_VALUE}").Do()

	api.Secrets.Create(proj.ID, "shared", "SHARED_API_KEY", "shared-api-key-value").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "CROSS_ENV_REF", "${shared.SHARED_API_KEY}").Do()

	api.Secrets.Create(proj.ID, proj.EnvSlug, "COMMON_SECRET", "common-value").Path("/common").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "CROSS_PATH_REF", "${dev.common.COMMON_SECRET}").Do()

	identity := api.Identities.Create("list-expansion-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-expansion-imports").Do()

	api.Folders.Create(proj.ID, "prod", "/", "config")
	api.Folders.Create(proj.ID, "staging", "/", "services")
	api.Folders.Create(proj.ID, "dev", "/", "app")

	api.Secrets.Create(proj.ID, "prod", "PROD_ROOT", "prod-root").Do()
	api.Secrets.Create(proj.ID, "prod", "PROD_DB_HOST", "prod-db.example.com").Path("/config").Do()
	api.Secrets.Create(proj.ID, "prod", "SHARED_KEY", "prod-shared-value").Path("/config").Do()

	api.Secrets.Create(proj.ID, "staging", "STAGING_API_URL", "https://staging-api.example.com").Do()
	api.Secrets.Create(proj.ID, "staging", "SHARED_KEY", "staging-shared-value").Do()
	api.Secrets.Create(proj.ID, "staging", "IMPORT_PRIORITY_KEY", "from-first-import").Do()
	api.Secrets.Create(proj.ID, "staging", "SERVICE_URL", "https://staging-service.example.com").Path("/services").Do()
	api.Secrets.Create(proj.ID, "staging", "IMPORT_PRIORITY_KEY", "from-second-import").Path("/services").Do()
	api.Imports.Create(proj.ID, "staging", "/", "prod", "/config").Do()

	api.Secrets.Create(proj.ID, "dev", "LOCAL_SECRET", "local-only").Do()
	api.Secrets.Create(proj.ID, "dev", "SHARED_KEY", "dev-shared-value").Do()
	api.Secrets.Create(proj.ID, "dev", "APP_CONFIG", "app-config").Path("/app").Do()

	api.Secrets.Create(proj.ID, "dev", "REF_LOCAL", "${LOCAL_SECRET}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_STAGING", "${STAGING_API_URL}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_SHARED", "${SHARED_KEY}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_SERVICE", "${SERVICE_URL}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_PROD_VIA_STAGING", "${PROD_DB_HOST}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_CHAIN", "host=${PROD_DB_HOST}&api=${STAGING_API_URL}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_MISSING", "${NOT_EXISTS}").Do()
	api.Secrets.Create(proj.ID, "dev", "REF_IMPORT_PRIORITY", "${IMPORT_PRIORITY_KEY}").Do()

	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/services").Do()
	api.Imports.Create(proj.ID, "dev", "/app", "prod", "/config").Do()

	api.Secrets.Create(proj.ID, "dev", "APP_DB_URL", "postgres://${PROD_DB_HOST}:5432/app").Path("/app").Do()

	identity := api.Identities.Create("list-expansion-imports-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
