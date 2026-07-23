//go:build integration

package secrets_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
	"github.com/infisical/api/tests/infra/nodejs"
)

// These tests pin the import-response contract: `imports` lists only the
// directly-configured (top-level) imports of the requested folder, and each
// top-level entry's `secrets` array contains the secrets resolved recursively
// from its own nested imports (flattened into the top-level entry). The chain
// resolver dedupes by (environment, path), so a source reachable more than once
// appears only once and cycles terminate. Reference expansion across imports is
// covered separately in list_secrets_expansion_test.go.

// importSecretKeys collects the secret keys of a single top-level import entry.
func importSecretKeys(imp secret.SecretImport) []string {
	keys := make([]string, len(imp.Secrets))
	for i := range imp.Secrets {
		keys[i] = imp.Secrets[i].SecretKey
	}
	return keys
}

func TestListSecrets_Imports(t *testing.T) {
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-imports").Do()

	api.Secrets.Create(proj.ID, "staging", "STAGING_DB_URL", "staging-db-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_API_KEY", "staging-api-value").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_SECRET", "dev-value").Do()
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()

	identity := api.Identities.Create("list-imports-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
		assert.ElementsMatch(t, []string{"STAGING_DB_URL", "STAGING_API_KEY"}, importSecretKeys(resp.Imports[0]))
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

// TestListSecrets_Imports_NestedLevels verifies that a multi-level import chain
// (dev -> staging -> prod) collapses to a single top-level entry whose secrets
// array contains the recursively-resolved secrets from the deeper levels.
func TestListSecrets_Imports_NestedLevels(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-imports-nested").Do()

	// Deepest level.
	api.Secrets.Create(proj.ID, "prod", "PROD_KEY", "prod-value").Do()
	// Middle level imports the deepest.
	api.Secrets.Create(proj.ID, "staging", "STAGING_KEY", "staging-value").Do()
	api.Imports.Create(proj.ID, "staging", "/", "prod", "/").Do()
	// Top level (requested) imports the middle.
	api.Secrets.Create(proj.ID, "dev", "DEV_KEY", "dev-value").Do()
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()

	identity := api.Identities.Create("list-imports-nested-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
		IncludeImports:  new(true),
	})
	require.NoError(t, err)

	// Only the directly-configured secret is a direct secret.
	require.Len(t, resp.Secrets, 1)
	assert.Equal(t, "DEV_KEY", resp.Secrets[0].SecretKey)

	// Only the direct import (staging) is a top-level entry; the nested prod
	// import is flattened into it.
	require.Len(t, resp.Imports, 1, "only the direct import should be a top-level entry")
	assert.Equal(t, "staging", resp.Imports[0].Environment)
	assert.Equal(t, "/", resp.Imports[0].SecretPath)
	assert.ElementsMatch(t, []string{"STAGING_KEY", "PROD_KEY"}, importSecretKeys(resp.Imports[0]),
		"top-level import should contain its own and the recursively-imported secrets")
}

// TestListSecrets_Imports_Duplicate verifies that a source reachable through more
// than one path (dev imports both staging and prod, and prod also imports
// staging) is resolved only once — the chain resolver dedupes by (env, path).
func TestListSecrets_Imports_Duplicate(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-imports-dup").Do()

	api.Secrets.Create(proj.ID, "staging", "STAGING_KEY", "staging-value").Do()
	api.Secrets.Create(proj.ID, "prod", "PROD_KEY", "prod-value").Do()
	// prod also imports staging (so staging is reachable twice from dev).
	api.Imports.Create(proj.ID, "prod", "/", "staging", "/").Do()
	// dev imports both staging (directly) and prod.
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()
	api.Imports.Create(proj.ID, "dev", "/", "prod", "/").Do()

	identity := api.Identities.Create("list-imports-dup-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
		IncludeImports:  new(true),
	})
	require.NoError(t, err)

	// Two direct imports => two top-level entries (staging, prod).
	require.Len(t, resp.Imports, 2)

	// STAGING_KEY must appear exactly once across all import entries: the
	// prod->staging duplicate is deduped, not merged into prod's entry too.
	stagingCount := 0
	for _, imp := range resp.Imports {
		for _, key := range importSecretKeys(imp) {
			if key == "STAGING_KEY" {
				stagingCount++
			}
		}
	}
	assert.Equal(t, 1, stagingCount, "a doubly-reachable source must resolve only once")
}

// TestListSecrets_Imports_CircularReference verifies that a cyclic import graph
// terminates instead of looping. A direct 2-node cycle is rejected at creation,
// but the write-time guard only checks the immediate reverse edge, so a 3-node
// cycle (dev -> staging -> prod -> dev) can be formed. Listing dev must still
// return: the resolver's visited-set bounds the walk, and the cycle collapses
// into the single top-level import with every reachable secret merged in.
func TestListSecrets_Imports_CircularReference(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-imports-cycle").Do()

	api.Secrets.Create(proj.ID, "dev", "DEV_KEY", "dev-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_KEY", "staging-value").Do()
	api.Secrets.Create(proj.ID, "prod", "PROD_KEY", "prod-value").Do()

	// dev -> staging -> prod -> dev (the prod -> dev edge closes the cycle and is
	// accepted because dev does not directly import prod).
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()
	api.Imports.Create(proj.ID, "staging", "/", "prod", "/").Do()
	api.Imports.Create(proj.ID, "prod", "/", "dev", "/").Do()

	identity := api.Identities.Create("list-imports-cycle-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	// Must return rather than loop on the dev -> staging -> prod -> dev cycle.
	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
		IncludeImports:  new(true),
	})
	require.NoError(t, err)

	require.Len(t, resp.Imports, 1, "staging is the only direct import")
	assert.Equal(t, "staging", resp.Imports[0].Environment)
	// staging (direct) and prod (depth 1) merge into the single top-level entry;
	// the cycle back to dev terminates and does not re-surface the origin's own
	// secrets, so DEV_KEY is not present in the import.
	assert.ElementsMatch(t, []string{"STAGING_KEY", "PROD_KEY"}, importSecretKeys(resp.Imports[0]))
}

// findImport returns the top-level import entry for (environment, path), or nil.
func findImport(imports []secret.SecretImport, environment, path string) *secret.SecretImport {
	for i := range imports {
		if imports[i].Environment == environment && imports[i].SecretPath == path {
			return &imports[i]
		}
	}
	return nil
}

// TestListSecrets_Imports_Replication covers a replication import. Replication
// copies the source secrets (asynchronously) into a reserved folder
// (/__reserve_replication_<id>) in the destination environment, but on read the
// import is surfaced under its ORIGINAL source location and its permission is
// evaluated against that original source — not the physical reserved path. So a
// reader scoped only to the destination environment cannot see it.
func TestListSecrets_Imports_Replication(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-imports-replication").Do()

	api.Secrets.Create(proj.ID, "prod", "PROD_SECRET", "prod-secret-value").Do()
	// dev replicates prod:/ — secrets are copied into dev's reserved folder async.
	api.Imports.Create(proj.ID, "dev", "/", "prod", "/").Replication().Do()

	q := &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
		IncludeImports:  new(true),
	}

	admin := api.Identities.Create("list-imports-replication-admin")
	api.Identities.AddToProject(proj.ID, admin.ID).Role("admin").Do()
	adminClient := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(admin.ID, nj.OrgID())).
		Build()

	// Replication is async: poll until the reserved folder is populated and the
	// import surfaces under its original source (prod:/) with the replicated secret.
	var replicated *secret.SecretImport
	require.Eventually(t, func() bool {
		resp, err := listSecrets(adminClient, q)
		if err != nil {
			return false
		}
		imp := findImport(resp.Imports, "prod", "/")
		if imp == nil {
			return false
		}
		for _, key := range importSecretKeys(*imp) {
			if key == "PROD_SECRET" {
				replicated = imp
				return true
			}
		}
		return false
	}, 90*time.Second, 2*time.Second, "replicated secret should appear under the original source")

	// Surfaced under the original source (prod:/), never the reserved folder path
	// (dev:/__reserve_replication_<id>) where the data physically lives.
	require.NotNil(t, replicated)
	assert.Equal(t, "prod", replicated.Environment)
	assert.Equal(t, "/", replicated.SecretPath)
	assert.NotContains(t, replicated.SecretPath, "__reserve_replication_")

	// Permission is evaluated against the original source (prod). A reader scoped
	// to the destination environment (dev) only — who physically owns the reserved
	// folder — must NOT be able to read the replicated value.
	devOnly := api.Roles.CreateCustom(proj.ID, "dev-only-reader", "Dev Only Reader", nodejs.Permission{
		Subject:    "secrets",
		Action:     []string{"read"},
		Conditions: map[string]any{"environment": "dev"},
	})
	devReader := api.Identities.Create("list-imports-replication-dev-only")
	api.Identities.AddToProject(proj.ID, devReader.ID).Role(devOnly.Slug).Do()
	devClient := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(devReader.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(devClient, q)
	require.NoError(t, err)
	for i := range resp.Imports {
		for j := range resp.Imports[i].Secrets {
			s := resp.Imports[i].Secrets[j]
			if s.SecretKey == "PROD_SECRET" {
				assert.NotEqual(t, "prod-secret-value", s.SecretValue,
					"dev-only reader must not read a value replicated from prod (permission follows the source)")
			}
		}
	}
}
