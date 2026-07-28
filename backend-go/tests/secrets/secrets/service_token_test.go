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

// Service-token scope enforcement is handler/permission logic and is reachable
// here. Token expiry and bearer validation live in the auth middleware (which
// these tests bypass by injecting the identity) and are covered by auth tests.

func TestServiceToken_ListSecrets_Scope(t *testing.T) {
	tests := []struct {
		name        string
		tokenScope  nodejs.ServiceTokenScope
		listEnv     string
		listPath    string
		wantKeys    []string
		description string
	}{
		{
			name:       "within env and path scope",
			tokenScope: nodejs.ServiceTokenScope{Environment: "dev", SecretPath: "/"},
			listEnv:    "dev",
			listPath:   "/",
			wantKeys:   []string{"DEV_ROOT"},
		},
		{
			name:       "outside env scope returns empty",
			tokenScope: nodejs.ServiceTokenScope{Environment: "dev", SecretPath: "/"},
			listEnv:    "staging",
			listPath:   "/",
			wantKeys:   nil,
		},
		{
			name:       "outside path scope returns empty",
			tokenScope: nodejs.ServiceTokenScope{Environment: "dev", SecretPath: "/app"},
			listEnv:    "dev",
			listPath:   "/",
			wantKeys:   nil,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("svc-token-list").Do()
			api.Folders.Create(proj.ID, "dev", "/", "app")
			api.Secrets.Create(proj.ID, "dev", "DEV_ROOT", "dev-root-value").Do()
			api.Secrets.Create(proj.ID, "dev", "APP_SECRET", "app-value").Path("/app").Do()
			api.Secrets.Create(proj.ID, "staging", "STAGING_ROOT", "staging-value").Do()

			token := api.ServiceTokens.Create(proj.ID).
				Scopes(tc.tokenScope).
				Permissions("read").
				Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.ServiceTokenIdentity(token.ID, nj.OrgID())).
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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("svc-token-get").Do()
			api.Secrets.Create(proj.ID, "dev", "DEV_ROOT", "dev-root-value").Do()
			api.Secrets.Create(proj.ID, "staging", "STAGING_ROOT", "staging-value").Do()

			// Token scoped to dev:/ only.
			token := api.ServiceTokens.Create(proj.ID).
				Scopes(nodejs.ServiceTokenScope{Environment: "dev", SecretPath: "/"}).
				Permissions("read").
				Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.ServiceTokenIdentity(token.ID, nj.OrgID())).
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
