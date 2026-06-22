//go:build integration

package secrets_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
)

// Service-token scope enforcement is handler/permission logic and is reachable
// here. Token expiry and bearer validation live in the auth middleware (which
// these tests bypass by injecting the identity) and are covered by auth tests.

func TestServiceToken_ListSecrets_Scope(t *testing.T) {
	tests := []struct {
		name        string
		tokenScope  infra.ServiceTokenScope
		listEnv     string
		listPath    string
		wantKeys    []string
		description string
	}{
		{
			name:       "within env and path scope",
			tokenScope: infra.ServiceTokenScope{Environment: "dev", SecretPath: "/"},
			listEnv:    "dev",
			listPath:   "/",
			wantKeys:   []string{"DEV_ROOT"},
		},
		{
			name:       "outside env scope returns empty",
			tokenScope: infra.ServiceTokenScope{Environment: "dev", SecretPath: "/"},
			listEnv:    "staging",
			listPath:   "/",
			wantKeys:   nil,
		},
		{
			name:       "outside path scope returns empty",
			tokenScope: infra.ServiceTokenScope{Environment: "dev", SecretPath: "/app"},
			listEnv:    "dev",
			listPath:   "/",
			wantKeys:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "svc-token-list")
			nodejs.CreateFolder(t, proj.ID, "dev", "/", "app")
			nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_ROOT", "dev-root-value", nil)
			nodejs.CreateSecret(t, proj.ID, "dev", "/app", "APP_SECRET", "app-value", nil)
			nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_ROOT", "staging-value", nil)

			token := nodejs.CreateServiceToken(t, proj.ID, &infra.CreateServiceTokenOpts{
				Scopes:      []infra.ServiceTokenScope{tc.tokenScope},
				Permissions: []string{"read"},
			})

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.ServiceTokenIdentity(token.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     tc.listEnv,
				SecretPath:      new(tc.listPath),
				ViewSecretValue: new(true),
			})
			require.NoError(t, err)

			keys := make([]string, len(resp.Secrets))
			for i, s := range resp.Secrets {
				keys[i] = s.SecretKey
			}
			assert.ElementsMatch(t, tc.wantKeys, keys)
		})
	}
}

func TestServiceToken_GetSecretByName_Scope(t *testing.T) {
	tests := []struct {
		name       string
		getEnv     string
		getPath    string
		secretName string
		wantValue  string
		wantErr    bool
	}{
		{
			name:       "within scope returns secret",
			getEnv:     "dev",
			getPath:    "/",
			secretName: "DEV_ROOT",
			wantValue:  "dev-root-value",
		},
		{
			name:       "outside env scope is denied",
			getEnv:     "staging",
			getPath:    "/",
			secretName: "STAGING_ROOT",
			wantErr:    true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "svc-token-get")
			nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_ROOT", "dev-root-value", nil)
			nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_ROOT", "staging-value", nil)

			// Token scoped to dev:/ only.
			token := nodejs.CreateServiceToken(t, proj.ID, &infra.CreateServiceTokenOpts{
				Scopes:      []infra.ServiceTokenScope{{Environment: "dev", SecretPath: "/"}},
				Permissions: []string{"read"},
			})

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.ServiceTokenIdentity(token.ID, nodejs.OrgID())).
				Build()

			resp, err := getSecret(client, tc.secretName, &secret.GetSecretByNameV4Query{
				ProjectID:       proj.ID,
				Environment:     tc.getEnv,
				SecretPath:      new(tc.getPath),
				ViewSecretValue: new(true),
			})

			if tc.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.secretName, resp.Secret.SecretKey)
			assert.Equal(t, tc.wantValue, resp.Secret.SecretValue)
		})
	}
}
