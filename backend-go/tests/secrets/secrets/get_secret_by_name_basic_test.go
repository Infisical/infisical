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

func TestGetSecretByName_Basic(t *testing.T) {
	tests := []struct {
		name       string
		secretName string
		path       string // defaults to "/"
		seed       func(t *testing.T, api *nodejs.API, projectID, env string)
		wantErr    string // non-empty => expect an error containing this substring
		assertResp func(t *testing.T, resp secret.GetSecretByNameV4Response)
	}{
		{
			name:       "returns decrypted value",
			secretName: "PLAIN_SECRET",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "PLAIN_SECRET", "plain-value").Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				assert.Equal(t, "plain-value", resp.Secret.SecretValue)
			},
		},
		{
			name:       "returns comment",
			secretName: "COMMENTED_SECRET",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "COMMENTED_SECRET", "commented-value").
					Comment("This is a comment for the secret").Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				assert.Equal(t, "This is a comment for the secret", resp.Secret.SecretComment)
			},
		},
		{
			name:       "returns metadata",
			secretName: "METADATA_SECRET",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "METADATA_SECRET", "metadata-value").
					Metadata(
						nodejs.SecretMetadataEntry{Key: "env", Value: "production"},
						nodejs.SecretMetadataEntry{Key: "owner", Value: "platform-team"},
					).Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				require.NotEmpty(t, resp.Secret.SecretMetadata)
				metadataMap := make(map[string]string)
				for _, m := range resp.Secret.SecretMetadata {
					metadataMap[m.Key] = m.Value
				}
				assert.Equal(t, "production", metadataMap["env"])
				assert.Equal(t, "platform-team", metadataMap["owner"])
			},
		},
		{
			name:       "returns reminder",
			secretName: "REMINDER_SECRET",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Secrets.Create(projectID, env, "REMINDER_SECRET", "reminder-value").
					Reminder("Remember to rotate this secret", 30).Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				require.NotNil(t, resp.Secret.SecretReminderNote)
				assert.Equal(t, "Remember to rotate this secret", *resp.Secret.SecretReminderNote)
				require.NotNil(t, resp.Secret.SecretReminderRepeatDays)
				assert.Equal(t, 30, *resp.Secret.SecretReminderRepeatDays)
			},
		},
		{
			name:       "returns tag with color",
			secretName: "TAGGED_SECRET",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				tag := api.Tags.Create(projectID, "important", "Important", "#ff0000")
				api.Secrets.Create(projectID, env, "TAGGED_SECRET", "tagged-value").Tags(tag.ID).Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				require.Len(t, resp.Secret.Tags, 1)
				assert.Equal(t, "important", resp.Secret.Tags[0].Slug)
				require.NotNil(t, resp.Secret.Tags[0].Color)
				assert.Equal(t, "#ff0000", *resp.Secret.Tags[0].Color)
			},
		},
		{
			name:       "secretPath filters to nested folder",
			secretName: "NESTED_GET_SECRET",
			path:       "/nested",
			seed: func(t *testing.T, api *nodejs.API, projectID, env string) {
				api.Folders.Create(projectID, env, "/", "nested")
				api.Secrets.Create(projectID, env, "NESTED_GET_SECRET", "nested-get-value").Path("/nested").Do()
			},
			assertResp: func(t *testing.T, resp secret.GetSecretByNameV4Response) {
				assert.Equal(t, "nested-get-value", resp.Secret.SecretValue)
			},
		},
		{
			name:       "missing secret returns not found",
			secretName: "NON_EXISTENT_SECRET",
			wantErr:    "not found",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("get-basic").Do()
			if tc.seed != nil {
				tc.seed(t, api, proj.ID, proj.EnvSlug)
			}

			identity := api.Identities.Create("get-basic-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			path := tc.path
			if path == "" {
				path = "/"
			}

			resp, err := getSecret(client, tc.secretName, &secret.GetSecretByNameV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new(path),
				ViewSecretValue: new(true),
			})

			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tc.secretName, resp.Secret.SecretKey)
			if tc.assertResp != nil {
				tc.assertResp(t, resp)
			}
		})
	}
}

// TestGetSecretByName_Validation covers required-param validation. These send
// omitted required params, which the typed query struct cannot express, so they
// build the request directly with raw params.
func TestGetSecretByName_Validation(t *testing.T) {
	tests := []struct {
		name        string
		includeProj bool
		includeEnv  bool
	}{
		{name: "missing projectId returns 400", includeProj: false, includeEnv: true},
		{name: "missing environment returns 400", includeProj: true, includeEnv: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("get-validation").Do()
			identity := api.Identities.Create("get-validation-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			req := client.Get("/api/v4/secrets/SOME_SECRET")
			if tc.includeProj {
				req.Param("projectId", proj.ID)
			}
			if tc.includeEnv {
				req.Param("environment", proj.EnvSlug)
			}
			req.ExpectStatus(400)
		})
	}
}

// TestGetSecretByName_Version retrieves a specific historical version via the
// version query param after the secret has been updated.
func TestGetSecretByName_Version(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("get-version").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "VERSIONED", "v1-value").Do()
	api.Secrets.Update(proj.ID, proj.EnvSlug, "VERSIONED", "v2-value").Do()

	identity := api.Identities.Create("get-version-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	t.Run("latest version by default", func(t *testing.T) {
		resp, err := getSecret(client, "VERSIONED", &secret.GetSecretByNameV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)
		assert.Equal(t, "v2-value", resp.Secret.SecretValue)
		assert.Equal(t, 2, resp.Secret.Version)
	})

	t.Run("specific older version", func(t *testing.T) {
		resp, err := getSecret(client, "VERSIONED", &secret.GetSecretByNameV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			Version:         new(1),
		})
		require.NoError(t, err)
		assert.Equal(t, "v1-value", resp.Secret.SecretValue)
		assert.Equal(t, 1, resp.Secret.Version)
	})

	t.Run("nonexistent version errors", func(t *testing.T) {
		_, err := getSecret(client, "VERSIONED", &secret.GetSecretByNameV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			Version:         new(999),
		})
		require.Error(t, err)
	})
}

// TestGetSecretByName_ResponseFields covers the response fields not exercised by
// the core cases: skipMultilineEncoding, actor, and the rotation flags. A rotated
// secret requires secret rotation setup (no test infra yet); this verifies a
// normal secret is correctly reported as not rotated.
func TestGetSecretByName_ResponseFields(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("get-response-fields").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "MULTILINE", "line1\nline2").SkipMultilineEncoding().Do()

	identity := api.Identities.Create("get-response-fields-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := getSecret(client, "MULTILINE", &secret.GetSecretByNameV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.NoError(t, err)

	require.NotNil(t, resp.Secret.SkipMultilineEncoding, "skipMultilineEncoding should be present")
	assert.True(t, *resp.Secret.SkipMultilineEncoding)

	require.NotNil(t, resp.Secret.IsRotatedSecret, "isRotatedSecret should be present")
	assert.False(t, *resp.Secret.IsRotatedSecret, "a normal secret is not a rotated secret")
	assert.Nil(t, resp.Secret.RotationID, "rotationId should be absent for a non-rotated secret")
}
