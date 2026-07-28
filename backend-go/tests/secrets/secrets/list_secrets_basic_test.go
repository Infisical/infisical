//go:build integration

package secrets_test

import (
	"context"
	"fmt"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
	"github.com/infisical/api/tests/infra/nodejs"
)

func TestListSecrets_Basic(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-basic").Do()

	tag1 := api.Tags.Create(proj.ID, "env-prod", "Production", "#FF0000")
	tag2 := api.Tags.Create(proj.ID, "sensitive", "Sensitive", "#0000FF")

	api.Secrets.Create(proj.ID, proj.EnvSlug, "PLAIN_SECRET", "plain-value").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "ENCRYPTED_SECRET", "decrypted-correctly").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "TAGGED_SECRET", "tagged-value").Tags(tag1.ID, tag2.ID).Do()

	identity := api.Identities.Create("list-basic-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, resp.Secrets, 3)

	// Structure + decryption.
	plain := findSecret(resp.Secrets, "PLAIN_SECRET")
	require.NotNil(t, plain)
	assert.NotEmpty(t, plain.ID)
	assert.Equal(t, "PLAIN_SECRET", plain.SecretKey)
	assert.Equal(t, "plain-value", plain.SecretValue)
	assert.Equal(t, proj.EnvSlug, plain.Environment)
	assert.NotEmpty(t, plain.Workspace)
	assert.NotEmpty(t, plain.CreatedAt)
	assert.NotEmpty(t, plain.UpdatedAt)
	assert.Equal(t, 1, plain.Version)
	assert.Equal(t, secret.Shared, plain.Type)

	encrypted := findSecret(resp.Secrets, "ENCRYPTED_SECRET")
	require.NotNil(t, encrypted)
	assert.Equal(t, "decrypted-correctly", encrypted.SecretValue)

	// Tags.
	tagged := findSecret(resp.Secrets, "TAGGED_SECRET")
	require.NotNil(t, tagged)
	require.Len(t, tagged.Tags, 2)
	tagSlugs := make([]string, len(tagged.Tags))
	for i, tag := range tagged.Tags {
		tagSlugs[i] = tag.Slug
	}
	assert.Contains(t, tagSlugs, "env-prod")
	assert.Contains(t, tagSlugs, "sensitive")
}

func TestListSecrets_ReturnsComment(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-comment").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_WITH_COMMENT", "secret-value").
		Comment("This is a test comment for the secret").Do()

	identity := api.Identities.Create("list-comment-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})

	require.NoError(t, err)
	require.Len(t, resp.Secrets, 1)
	assert.Equal(t, "SECRET_WITH_COMMENT", resp.Secrets[0].SecretKey)
	assert.Equal(t, "secret-value", resp.Secrets[0].SecretValue)
	assert.Equal(t, "This is a test comment for the secret", resp.Secrets[0].SecretComment)
}

func TestListSecrets_Metadata(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-metadata").Do()

	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_WITH_METADATA", "secret-value").
		Metadata(
			nodejs.SecretMetadataEntry{Key: "owner", Value: "platform-team"},
			nodejs.SecretMetadataEntry{Key: "sensitivity", Value: "high"},
		).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_WITH_COMMENT", "full-value").
		Comment("A secret with both comment and metadata").
		Metadata(
			nodejs.SecretMetadataEntry{Key: "env", Value: "production"},
		).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_MIXED_ENCRYPTION", "encrypted-meta-value").
		Metadata(
			nodejs.SecretMetadataEntry{Key: "plaintext", Value: "plain-value", IsEncrypted: false},
			nodejs.SecretMetadataEntry{Key: "sensitive", Value: "encrypted-value", IsEncrypted: true},
		).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "PROD_SECRET", "prod-value").
		Metadata(nodejs.SecretMetadataEntry{Key: "env", Value: "production"}).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "DEV_SECRET", "dev-value").
		Metadata(nodejs.SecretMetadataEntry{Key: "env", Value: "development"}).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "NO_METADATA", "no-meta-value").Do()

	identity := api.Identities.Create("list-metadata-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	t.Run("returns metadata fields", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)

		secretItem := findSecret(resp.Secrets, "SECRET_WITH_METADATA")
		require.NotNil(t, secretItem)
		require.Len(t, secretItem.SecretMetadata, 2)
		metadataMap := make(map[string]string)
		for _, m := range secretItem.SecretMetadata {
			metadataMap[m.Key] = m.Value
		}
		assert.Equal(t, "platform-team", metadataMap["owner"])
		assert.Equal(t, "high", metadataMap["sensitivity"])
	})

	t.Run("comment and metadata together", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)

		secretItem := findSecret(resp.Secrets, "SECRET_WITH_COMMENT")
		require.NotNil(t, secretItem)
		assert.Equal(t, "full-value", secretItem.SecretValue)
		assert.Equal(t, "A secret with both comment and metadata", secretItem.SecretComment)
		require.Len(t, secretItem.SecretMetadata, 1)
		assert.Equal(t, "env", secretItem.SecretMetadata[0].Key)
		assert.Equal(t, "production", secretItem.SecretMetadata[0].Value)
	})

	t.Run("encrypted vs plaintext metadata", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)

		secretItem := findSecret(resp.Secrets, "SECRET_MIXED_ENCRYPTION")
		require.NotNil(t, secretItem)
		require.Len(t, secretItem.SecretMetadata, 2)

		metadataMap := make(map[string]*secret.ResourceMetadata)
		for i := range secretItem.SecretMetadata {
			m := &secretItem.SecretMetadata[i]
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
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			MetadataFilter:  new("key=env,value=production"),
		})
		require.NoError(t, err)
		require.Len(t, resp.Secrets, 2)

		keys := make([]string, len(resp.Secrets))
		for i, s := range resp.Secrets {
			keys[i] = s.SecretKey
		}
		assert.Contains(t, keys, "PROD_SECRET")
		assert.Contains(t, keys, "SECRET_WITH_COMMENT")
	})
}

func TestListSecrets_Reminder(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-reminder").Do()

	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_WITH_REMINDER", "reminder-value").
		Reminder("Rotate weekly", 7).Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "SECRET_WITHOUT_REMINDER", "no-reminder-value").Do()

	identity := api.Identities.Create("list-reminder-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, resp.Secrets, 2)

	withReminder := findSecret(resp.Secrets, "SECRET_WITH_REMINDER")
	require.NotNil(t, withReminder)
	require.NotNil(t, withReminder.SecretReminderNote)
	assert.Equal(t, "Rotate weekly", *withReminder.SecretReminderNote)
	require.NotNil(t, withReminder.SecretReminderRepeatDays)
	assert.Equal(t, 7, *withReminder.SecretReminderRepeatDays)

	withoutReminder := findSecret(resp.Secrets, "SECRET_WITHOUT_REMINDER")
	require.NotNil(t, withoutReminder)
	assert.Nil(t, withoutReminder.SecretReminderNote)
	assert.Nil(t, withoutReminder.SecretReminderRepeatDays)
}

func TestListSecrets_PathAndRecursive(t *testing.T) {
	tests := []struct {
		name      string
		path      string
		recursive *bool
		wantKeys  []string
	}{
		{
			name:      "recursive includes subfolders",
			path:      "/",
			recursive: new(true),
			wantKeys:  []string{"ROOT_SECRET", "LEVEL1_SECRET", "LEVEL2_SECRET", "API_SECRET", "WEB_SECRET"},
		},
		{
			name:      "non-recursive only current folder",
			path:      "/",
			recursive: new(false),
			wantKeys:  []string{"ROOT_SECRET"},
		},
		{
			name:     "specific path",
			path:     "/api",
			wantKeys: []string{"API_SECRET"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-path-recursive").Do()

			api.Folders.Create(proj.ID, proj.EnvSlug, "/", "level1")
			api.Folders.Create(proj.ID, proj.EnvSlug, "/level1", "level2")
			api.Folders.Create(proj.ID, proj.EnvSlug, "/", "api")
			api.Folders.Create(proj.ID, proj.EnvSlug, "/", "web")

			api.Secrets.Create(proj.ID, proj.EnvSlug, "ROOT_SECRET", "root-value").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "LEVEL1_SECRET", "level1-value").Path("/level1").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "LEVEL2_SECRET", "level2-value").Path("/level1/level2").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "API_SECRET", "api-value").Path("/api").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "WEB_SECRET", "web-value").Path("/web").Do()

			identity := api.Identities.Create("list-path-recursive-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new(tc.path),
				ViewSecretValue: new(true),
				Recursive:       tc.recursive,
			})
			require.NoError(t, err)
			require.Len(t, resp.Secrets, len(tc.wantKeys))

			keys := make([]string, len(resp.Secrets))
			for i, s := range resp.Secrets {
				keys[i] = s.SecretKey
			}
			assert.ElementsMatch(t, tc.wantKeys, keys)
		})
	}
}

func TestListSecrets_PersonalOverrides(t *testing.T) {
	tests := []struct {
		name             string
		asUser           bool // user has the personal override; identity does not
		includeOverrides bool
		wantValue        string
	}{
		{
			name:             "user without overrides sees shared",
			asUser:           true,
			includeOverrides: false,
			wantValue:        "shared-value",
		},
		{
			name:             "user with overrides sees personal",
			asUser:           true,
			includeOverrides: true,
			wantValue:        "personal-value",
		},
		{
			name:             "identity always sees shared",
			asUser:           false,
			includeOverrides: true,
			wantValue:        "shared-value",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-personal").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "MY_SECRET", "shared-value").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "MY_SECRET", "personal-value").Personal().Do()

			identity := api.Identities.Create("list-personal-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			actor := infra.MachineIdentity(identity.ID, nj.OrgID())
			if tc.asUser {
				actor = infra.UserIdentity(nj.UserID(), nj.OrgID())
			}
			client := infra.NewClientBuilder(t, newSecretsRouter(t)).Identity(actor).Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:                proj.ID,
				Environment:              proj.EnvSlug,
				SecretPath:               new("/"),
				ViewSecretValue:          new(true),
				IncludePersonalOverrides: new(tc.includeOverrides),
			})
			require.NoError(t, err)
			require.Len(t, resp.Secrets, 1)
			assert.Equal(t, "MY_SECRET", resp.Secrets[0].SecretKey)
			assert.Equal(t, tc.wantValue, resp.Secrets[0].SecretValue)
		})
	}
}

func TestListSecrets_TagFiltering(t *testing.T) {
	tests := []struct {
		name     string
		tagSlugs string
		wantKeys []string
	}{
		{name: "single tag", tagSlugs: "api", wantKeys: []string{"API_KEY"}},
		{name: "multiple tags", tagSlugs: "api,database", wantKeys: []string{"API_KEY", "DB_PASSWORD"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-tag-filter").Do()
			tag1 := api.Tags.Create(proj.ID, "api", "API", "#FF0000")
			tag2 := api.Tags.Create(proj.ID, "database", "Database", "#00FF00")

			api.Secrets.Create(proj.ID, proj.EnvSlug, "API_KEY", "api-key-value").Tags(tag1.ID).Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "DB_PASSWORD", "db-password").Tags(tag2.ID).Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "UNTAGGED_SECRET", "untagged-value").Do()

			identity := api.Identities.Create("list-tag-filter-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
				TagSlugs:        new(tc.tagSlugs),
			})
			require.NoError(t, err)
			require.Len(t, resp.Secrets, len(tc.wantKeys))

			keys := make([]string, len(resp.Secrets))
			for i, s := range resp.Secrets {
				keys[i] = s.SecretKey
			}
			assert.ElementsMatch(t, tc.wantKeys, keys)
		})
	}
}

func TestListSecrets_Errors(t *testing.T) {
	tests := []struct {
		name        string
		environment string
		path        string
		wantErr     string
	}{
		{name: "environment not found", environment: "nonexistent", path: "/", wantErr: "not found"},
		{name: "folder not found", environment: "dev", path: "/nonexistent/path", wantErr: "not found"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-errors").Do()
			identity := api.Identities.Create("list-errors-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			_, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     tc.environment,
				SecretPath:      new(tc.path),
				ViewSecretValue: new(true),
			})
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}

// TestListSecrets_Validation covers required-param validation, which the typed
// query struct cannot express, so the request is built with raw params.
func TestListSecrets_Validation(t *testing.T) {
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

			proj := api.Projects.Create("list-validation").Do()
			identity := api.Identities.Create("list-validation-identity")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
				Build()

			req := client.Get("/api/v4/secrets")
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

// TestListSecrets_SoftDeletedEnvironment is intentionally sequential: it asserts
// behavior before and after a soft delete on the same environment, so the steps
// cannot be parallelized.
func TestListSecrets_SoftDeletedEnvironment(t *testing.T) {
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-soft-delete-env").Do()

	customEnv := api.Environments.Create(proj.ID, "custom-env", "Custom Environment")

	api.Secrets.Create(proj.ID, "custom-env", "CUSTOM_SECRET", "custom-value").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "DEV_SECRET", "dev-value").Do()

	identity := api.Identities.Create("list-soft-delete-env-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	t.Run("secrets accessible before soft delete", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     "custom-env",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)
		require.Len(t, resp.Secrets, 1)
		assert.Equal(t, "CUSTOM_SECRET", resp.Secrets[0].SecretKey)
	})

	api.Environments.SoftDelete(proj.ID, customEnv.ID)

	t.Run("environment row still exists with softDeletedAt set", func(t *testing.T) {
		var softDeletedAt *time.Time
		err := stack.DB().Replica().QueryRow(context.Background(), `
			SELECT "softDeletedAt" FROM project_environments WHERE id = @envID
		`, pgx.NamedArgs{"envID": customEnv.ID}).Scan(&softDeletedAt)

		require.NoError(t, err, "environment row should still exist in database")
		require.NotNil(t, softDeletedAt, "softDeletedAt should be set (not NULL)")
	})

	t.Run("soft deleted environment returns not found", func(t *testing.T) {
		_, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     "custom-env",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})

	t.Run("other environments still work after soft delete", func(t *testing.T) {
		resp, err := listSecrets(client, &secret.ListSecretsV4Query{
			ProjectID:       proj.ID,
			Environment:     proj.EnvSlug,
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
		})
		require.NoError(t, err)
		require.Len(t, resp.Secrets, 1)
		assert.Equal(t, "DEV_SECRET", resp.Secrets[0].SecretKey)
	})
}

// TestListSecrets_StableOrdering verifies the response is ordered by key ascending
// regardless of creation order.
func TestListSecrets_StableOrdering(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-ordering").Do()
	// Create in deliberately non-alphabetical order.
	for _, key := range []string{"ZEBRA", "ALPHA", "MIKE", "BRAVO"} {
		api.Secrets.Create(proj.ID, proj.EnvSlug, key, "v").Do()
	}

	identity := api.Identities.Create("list-ordering-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.NoError(t, err)

	keys := make([]string, len(resp.Secrets))
	for i, s := range resp.Secrets {
		keys[i] = s.SecretKey
	}

	expected := append([]string(nil), keys...)
	sort.Strings(expected)
	assert.Equal(t, expected, keys, "secrets should be ordered by key ascending")
}

// TestListSecrets_LargeResponse verifies a large folder returns every secret.
func TestListSecrets_LargeResponse(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-large").Do()

	const count = 60
	for i := 0; i < count; i++ {
		api.Secrets.Create(proj.ID, proj.EnvSlug, fmt.Sprintf("KEY_%03d", i), fmt.Sprintf("value-%03d", i)).Do()
	}

	identity := api.Identities.Create("list-large-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	resp, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	assert.Len(t, resp.Secrets, count)
}

// TestListSecrets_ContentType verifies the success response is JSON.
func TestListSecrets_ContentType(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-content-type").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "KEY", "value").Do()

	identity := api.Identities.Create("list-content-type-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	_, status, header := listRaw(client, &secret.ListSecretsV4Query{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	}, nil)

	require.Equal(t, 200, status)
	assert.Contains(t, header.Get("Content-Type"), "application/json")
}

// TestListSecrets_InvalidProjectID verifies a non-existent/invalid project id is
// rejected rather than silently returning data.
func TestListSecrets_InvalidProjectID(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-invalid-project").Do()
	identity := api.Identities.Create("list-invalid-project-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()

	_, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID:       "not-a-valid-uuid",
		Environment:     proj.EnvSlug,
		SecretPath:      new("/"),
		ViewSecretValue: new(true),
	})
	require.Error(t, err)
}
