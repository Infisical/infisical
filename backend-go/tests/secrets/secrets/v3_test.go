//go:build integration

package secrets_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
)

// TestGetSecretByNameRawV3 covers the deprecated V3 raw endpoint, which accepts
// either workspaceId or workspaceSlug instead of projectId.
func TestGetSecretByNameRawV3(t *testing.T) {
	tests := []struct {
		name    string
		useSlug bool // otherwise workspaceId
	}{
		{name: "with workspaceSlug", useSlug: true},
		{name: "with workspaceId", useSlug: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("v3-get").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "V3_SECRET", "v3-value").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.UserIdentity(nj.UserID(), nj.OrgID())).
				Build()

			q := secret.GetSecretByNameRawV3Query{
				Environment:     new(proj.EnvSlug),
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			}
			if tc.useSlug {
				q.WorkspaceSlug = new(proj.Slug)
			} else {
				q.WorkspaceID = new(proj.ID)
			}

			resp, err := getSecretV3(client, "V3_SECRET", &q)

			require.NoError(t, err)
			assert.Equal(t, "V3_SECRET", resp.Secret.SecretKey)
			assert.Equal(t, "v3-value", resp.Secret.SecretValue)
		})
	}
}

// TestListSecretsRawV3 covers the deprecated V3 raw list endpoint.
func TestListSecretsRawV3(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("v3-list").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "V3_SECRET", "v3-value").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.UserIdentity(nj.UserID(), nj.OrgID())).
		Build()

	t.Run("with workspace slug", func(t *testing.T) {
		resp, err := listSecretsV3(client, &secret.ListSecretsRawV3Query{
			WorkspaceSlug:   new(proj.Slug),
			Environment:     new(proj.EnvSlug),
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)
		require.Len(t, resp.Secrets, 1)
		assert.Equal(t, "V3_SECRET", resp.Secrets[0].SecretKey)
	})

	t.Run("requires workspace id or slug", func(t *testing.T) {
		_, err := listSecretsV3(client, &secret.ListSecretsRawV3Query{
			Environment:     new("dev"),
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "workspaceId or workspaceSlug")
	})
}
