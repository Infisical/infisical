//go:build integration

package secrets_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
	"github.com/infisical/api/tests/infra/nodejs"
)

// The expansion algorithm itself (circular refs, self-reference, max depth,
// chained/nested absolute refs, import ordering) is exhaustively covered by the
// pure-function unit tests in internal/services/secrets/secret/expansion_test.go.
// These integration tests only cover what that unit test cannot: that expansion
// runs end-to-end through the handler, resolves against the real DB, is gated by
// live permissions, and feeds from imports.

func TestGetSecretByName_Expansion(t *testing.T) {
	tests := []struct {
		name     string
		target   string
		expand   bool
		seed     func(t *testing.T, api *nodejs.API, projectID, env string)
		expected string
	}{
		{
			name:   "expands same-folder reference",
			target: "ENDPOINT",
			expand: true,
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "HOST", "myhost.com").Do()
				api.Secrets.Create(projectID, env, "PORT", "5432").Do()
				api.Secrets.Create(projectID, env, "ENDPOINT", "${HOST}:${PORT}").Do()
			},
			expected: "myhost.com:5432",
		},
		{
			name:   "preserves references when expansion disabled",
			target: "ENDPOINT",
			expand: false,
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "HOST", "myhost.com").Do()
				api.Secrets.Create(projectID, env, "ENDPOINT", "${HOST}:8080").Do()
			},
			expected: "${HOST}:8080",
		},
		{
			name:   "expands absolute cross-env reference against the database",
			target: "CONN",
			expand: true,
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, "staging", "DB_HOST", "staging-db.example.com").Do()
				api.Secrets.Create(projectID, env, "CONN", "${staging.DB_HOST}").Do()
			},
			expected: "staging-db.example.com",
		},
		{
			name:   "expands absolute cross-env reference into a nested path",
			target: "CONN",
			expand: true,
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Folders.Create(projectID, "staging", "/", "db")
				api.Folders.Create(projectID, "staging", "/db", "primary")
				api.Secrets.Create(projectID, "staging", "DB_HOST", "primary-db.example.com").Path("/db/primary").Do()
				// ${env.path.KEY}: dotted path segments map to /db/primary.
				api.Secrets.Create(projectID, env, "CONN", "${staging.db.primary.DB_HOST}").Do()
			},
			expected: "primary-db.example.com",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("get-expansion").Do()
			tc.seed(t, api, proj.ID, proj.EnvSlug)

			identity := api.Identities.Create("get-expansion-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			resp, err := getSecret(client, tc.target, &secret.GetSecretByNameV4Query{
				ProjectID:              proj.ID,
				Environment:            proj.EnvSlug,
				SecretPath:             new("/"),
				ViewSecretValue:        new(true),
				ExpandSecretReferences: new(tc.expand),
			})

			require.NoError(t, err)
			assert.Equal(t, tc.target, resp.Secret.SecretKey)
			assert.Equal(t, tc.expected, resp.Secret.SecretValue)
		})
	}
}

// TestGetSecretByName_Imports verifies imports feed the lookup end-to-end: an
// imported secret is resolvable only when imports are included.
func TestGetSecretByName_Imports(t *testing.T) {
	tests := []struct {
		name           string
		includeImports bool
		wantErr        string
		wantValue      string
		wantSourceEnv  string
	}{
		{
			name:           "returns imported secret with source environment",
			includeImports: true,
			wantValue:      "staging-value",
			wantSourceEnv:  "staging",
		},
		{
			name:           "imported secret not found when excluded",
			includeImports: false,
			wantErr:        "not found",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("get-import").Do()
			api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()
			api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()

			identity := api.Identities.Create("get-import-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			resp, err := getSecret(client, "STAGING_SECRET", &secret.GetSecretByNameV4Query{
				ProjectID:       proj.ID,
				Environment:     "dev",
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
				IncludeImports:  new(tc.includeImports),
			})

			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, "STAGING_SECRET", resp.Secret.SecretKey)
			assert.Equal(t, tc.wantValue, resp.Secret.SecretValue)
			assert.Equal(t, tc.wantSourceEnv, resp.Secret.Environment, "should return actual source environment")
		})
	}
}

// TestGetSecretByName_ExpansionThroughImports verifies a relative reference is
// resolved using a secret that exists only via an import.
func TestGetSecretByName_ExpansionThroughImports(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("get-expansion-import").Do()
	// Base value lives in staging; dev imports staging and references it.
	api.Secrets.Create(proj.ID, "staging", "DB_HOST", "staging-db.example.com").Do()
	api.Secrets.Create(proj.ID, "dev", "DB_URL", "postgres://${DB_HOST}/app").Do()
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()

	identity := api.Identities.Create("get-expansion-import-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := getSecret(client, "DB_URL", &secret.GetSecretByNameV4Query{
		ProjectID:              proj.ID,
		Environment:            "dev",
		SecretPath:             new("/"),
		ViewSecretValue:        new(true),
		ExpandSecretReferences: new(true),
		IncludeImports:         new(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "postgres://staging-db.example.com/app", resp.Secret.SecretValue)
}
