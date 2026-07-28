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

// TestGetSecretByName_ImportPermissions verifies that importing a secret across
// environments requires permission on the source environment, not just the
// importing one. The project, secrets, import, and identities are read-only
// fixtures shared across the cases.
func TestGetSecretByName_ImportPermissions(t *testing.T) {
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("get-import-perm").Do()

	api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_DIRECT", "dev-direct-value").Do()
	api.Imports.Create(proj.ID, "dev", "/", "staging", "/").Do()

	devOnlyRole := api.Roles.CreateCustom(proj.ID, "dev-only-reader", "Dev Only", nodejs.Permission{
		Subject:    "secrets",
		Action:     []string{"read"},
		Conditions: map[string]any{"environment": "dev"},
	})
	devOnlyIdentity := api.Identities.Create("dev-only-identity")
	api.Identities.AddToProject(proj.ID, devOnlyIdentity.ID).Role(devOnlyRole.Slug).Do()

	adminIdentity := api.Identities.Create("admin-identity")
	api.Identities.AddToProject(proj.ID, adminIdentity.ID).Role("admin").Do()

	tests := []struct {
		name           string
		identityID     string
		secretName     string
		includeImports bool
		wantErr        string
		wantValue      string
		wantSourceEnv  string
	}{
		{
			name:           "direct secret allowed with env-scoped permission",
			identityID:     devOnlyIdentity.ID,
			secretName:     "DEV_DIRECT",
			includeImports: false,
			wantValue:      "dev-direct-value",
		},
		{
			name:           "imported secret denied without source env permission",
			identityID:     devOnlyIdentity.ID,
			secretName:     "STAGING_SECRET",
			includeImports: true,
			wantErr:        "Permission",
		},
		{
			name:           "imported secret allowed with admin permission",
			identityID:     adminIdentity.ID,
			secretName:     "STAGING_SECRET",
			includeImports: true,
			wantValue:      "staging-value",
			wantSourceEnv:  "staging",
		},
		{
			name:           "imported secret not found when imports excluded",
			identityID:     adminIdentity.ID,
			secretName:     "STAGING_SECRET",
			includeImports: false,
			wantErr:        "not found",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(tc.identityID, nj.OrgID())).
				Build()

			resp, err := getSecret(client, tc.secretName, &secret.GetSecretByNameV4Query{
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
			assert.Equal(t, tc.secretName, resp.Secret.SecretKey)
			assert.Equal(t, tc.wantValue, resp.Secret.SecretValue)
			if tc.wantSourceEnv != "" {
				assert.Equal(t, tc.wantSourceEnv, resp.Secret.Environment, "should return actual source environment")
			}
		})
	}
}
