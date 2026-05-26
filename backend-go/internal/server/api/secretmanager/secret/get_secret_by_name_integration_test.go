//go:build integration

package secret_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secretmanager/secret"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/testutil/infra"
	"github.com/infisical/api/pkg/chita"
)

// =============================================================================
// Basic GetSecretByName Tests
// =============================================================================

func TestGetSecretByName_ReturnsSecret(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-basic-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PLAIN_SECRET", "plain-value", nil)

	identity := nodejs.CreateIdentity(t, "get-basic-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("PLAIN_SECRET"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "PLAIN_SECRET", result.Secret.SecretKey.Get())
	assert.Equal(t, "plain-value", result.Secret.SecretValue.Get())
}

func TestGetSecretByName_WithExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-expansion-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PORT", "5432", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:${PORT}", nil)

	identity := nodejs.CreateIdentity(t, "get-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:             chita.NewRequired("ENDPOINT"),
		ProjectID:              chita.NewRequired(proj.ID),
		Environment:            chita.NewRequired(proj.EnvSlug),
		SecretPath:             chita.NewOptional("/"),
		ViewSecretValue:        chita.NewOptional(true),
		ExpandSecretReferences: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey.Get())
	assert.Equal(t, "myhost.com:5432", result.Secret.SecretValue.Get(), "should expand references")
}

func TestGetSecretByName_WithoutExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-no-expansion-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:8080", nil)

	identity := nodejs.CreateIdentity(t, "get-no-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:             chita.NewRequired("ENDPOINT"),
		ProjectID:              chita.NewRequired(proj.ID),
		Environment:            chita.NewRequired(proj.EnvSlug),
		SecretPath:             chita.NewOptional("/"),
		ViewSecretValue:        chita.NewOptional(true),
		ExpandSecretReferences: chita.NewOptional(false),
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey.Get())
	assert.Equal(t, "${HOST}:8080", result.Secret.SecretValue.Get(), "should not expand references")
}

func TestGetSecretByName_NotFound(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-not-found-test")

	identity := nodejs.CreateIdentity(t, "get-not-found-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	_, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("NON_EXISTENT_SECRET"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestGetSecretByName_WithComment(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-comment-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "COMMENTED_SECRET", "commented-value", &infra.CreateSecretOpts{
		Comment: "This is a comment for the secret",
	})

	identity := nodejs.CreateIdentity(t, "get-comment-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("COMMENTED_SECRET"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "COMMENTED_SECRET", result.Secret.SecretKey.Get())
	assert.Equal(t, "This is a comment for the secret", result.Secret.SecretComment.Get())
}

func TestGetSecretByName_WithMetadata(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-metadata-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "METADATA_SECRET", "metadata-value", &infra.CreateSecretOpts{
		Metadata: []infra.SecretMetadataEntry{
			{Key: "env", Value: "production"},
			{Key: "owner", Value: "platform-team"},
		},
	})

	identity := nodejs.CreateIdentity(t, "get-metadata-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("METADATA_SECRET"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "METADATA_SECRET", result.Secret.SecretKey.Get())
	require.NotEmpty(t, result.Secret.SecretMetadata)

	metadataMap := make(map[string]string)
	for _, m := range result.Secret.SecretMetadata {
		metadataMap[m.Key.Get()] = m.Value.Get()
	}
	assert.Equal(t, "production", metadataMap["env"])
	assert.Equal(t, "platform-team", metadataMap["owner"])
}

// =============================================================================
// Expansion Without Imports Tests
// =============================================================================

func TestGetSecretByName_ExpandsSameFolderRefsWithoutImports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "no-imports-expansion-test")

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "BASE_URL", "https://api.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "ENDPOINT", "${BASE_URL}/v1/users", nil)

	identity := nodejs.CreateIdentity(t, "no-imports-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:             chita.NewRequired("ENDPOINT"),
		ProjectID:              chita.NewRequired(proj.ID),
		Environment:            chita.NewRequired("dev"),
		SecretPath:             chita.NewOptional("/"),
		ViewSecretValue:        chita.NewOptional(true),
		ExpandSecretReferences: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey.Get())
	assert.Equal(t, "https://api.example.com/v1/users", result.Secret.SecretValue.Get(),
		"should expand same-folder reference even without imports configured")
}

func TestGetSecretByName_ExpandsNestedRefsWithoutImports(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "nested-no-imports-test")

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "HOST", "db.example.com", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "PORT", "5432", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "CONNECTION", "${HOST}:${PORT}", nil)
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "FULL_DSN", "postgres://user@${CONNECTION}/mydb", nil)

	identity := nodejs.CreateIdentity(t, "nested-no-imports-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:             chita.NewRequired("FULL_DSN"),
		ProjectID:              chita.NewRequired(proj.ID),
		Environment:            chita.NewRequired("dev"),
		SecretPath:             chita.NewOptional("/"),
		ViewSecretValue:        chita.NewOptional(true),
		ExpandSecretReferences: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "FULL_DSN", result.Secret.SecretKey.Get())
	assert.Equal(t, "postgres://user@db.example.com:5432/mydb", result.Secret.SecretValue.Get(),
		"should expand nested references without imports")
}

// =============================================================================
// V3 Raw Endpoint Tests
// =============================================================================

func TestGetSecretByNameRawV3_WithWorkspaceSlug(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "v3-get-slug-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "V3_SECRET", "v3-value", nil)

	result, err := getSecretByNameRawV3AsUser(t, nodejs.UserID(), nodejs.OrgID(), &secret.GetSecretByNameRawV3Request{
		SecretName:      chita.NewRequired("V3_SECRET"),
		WorkspaceSlug:   chita.NewOptional(proj.Slug),
		Environment:     chita.NewOptional(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "V3_SECRET", result.Secret.SecretKey.Get())
	assert.Equal(t, "v3-value", result.Secret.SecretValue.Get())
}

func TestGetSecretByNameRawV3_WithWorkspaceId(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "v3-get-id-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "V3_ID_SECRET", "v3-id-value", nil)

	result, err := getSecretByNameRawV3AsUser(t, nodejs.UserID(), nodejs.OrgID(), &secret.GetSecretByNameRawV3Request{
		SecretName:      chita.NewRequired("V3_ID_SECRET"),
		WorkspaceID:     chita.NewOptional(proj.ID),
		Environment:     chita.NewOptional(proj.EnvSlug),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "V3_ID_SECRET", result.Secret.SecretKey.Get())
	assert.Equal(t, "v3-id-value", result.Secret.SecretValue.Get())
}

// =============================================================================
// Import Tests
// =============================================================================

func TestGetSecretByName_FromImport(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-import-test")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "get-import-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("STAGING_SECRET"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired("dev"),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
		IncludeImports:  chita.NewOptional(true),
	})

	require.NoError(t, err)
	assert.Equal(t, "STAGING_SECRET", result.Secret.SecretKey.Get())
	assert.Equal(t, "staging-value", result.Secret.SecretValue.Get())
	assert.Equal(t, "staging", result.Secret.Environment.Get(), "should return actual source environment")
}

func TestGetSecretByName_ImportNotFoundWhenExcluded(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-import-excluded-test")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_ONLY", "staging-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "get-import-excluded-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	_, err := getSecretByName(t, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &secret.GetSecretByNameV4Request{
		SecretName:      chita.NewRequired("STAGING_ONLY"),
		ProjectID:       chita.NewRequired(proj.ID),
		Environment:     chita.NewRequired("dev"),
		SecretPath:      chita.NewOptional("/"),
		ViewSecretValue: chita.NewOptional(true),
		IncludeImports:  chita.NewOptional(false),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

// =============================================================================
// HTTP Tests - Verify request parsing and response serialization
// =============================================================================

func TestGetSecretByNameV4_HTTP(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "http-get-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HTTP_GET_SECRET", "http-get-value", nil)
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "nested")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/nested", "NESTED_GET_SECRET", "nested-get-value", nil)

	identity := nodejs.CreateIdentity(t, "http-get-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	handler := newSecretsHandler(t)
	srv := newTestServer(t, handler, auth.ActorTypeIdentity, identity.ID, nodejs.OrgID())
	defer srv.Close()

	t.Run("success with path param and query params", func(t *testing.T) {
		resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, secret.GetSecretByNameV4Response](
			t, srv, "GET", "/api/v4/secrets/{secretName}", &secret.GetSecretByNameV4Request{
				SecretName:  chita.NewRequired("HTTP_GET_SECRET"),
				ProjectID:   chita.NewRequired(proj.ID),
				Environment: chita.NewRequired(proj.EnvSlug),
			})

		assert.Equal(t, 200, status)
		assert.Equal(t, "HTTP_GET_SECRET", resp.Secret.SecretKey.Get())
		assert.Equal(t, "http-get-value", resp.Secret.SecretValue.Get())
	})

	t.Run("secretPath query param filters correctly", func(t *testing.T) {
		resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, secret.GetSecretByNameV4Response](
			t, srv, "GET", "/api/v4/secrets/{secretName}", &secret.GetSecretByNameV4Request{
				SecretName:  chita.NewRequired("NESTED_GET_SECRET"),
				ProjectID:   chita.NewRequired(proj.ID),
				Environment: chita.NewRequired(proj.EnvSlug),
				SecretPath:  chita.NewOptional("/nested"),
			})

		assert.Equal(t, 200, status)
		assert.Equal(t, "NESTED_GET_SECRET", resp.Secret.SecretKey.Get())
		assert.Equal(t, "nested-get-value", resp.Secret.SecretValue.Get())
	})

	t.Run("missing projectId returns 400", func(t *testing.T) {
		resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, chita.ErrorBody](
			t, srv, "GET", "/api/v4/secrets/{secretName}", &secret.GetSecretByNameV4Request{
				SecretName:  chita.NewRequired("HTTP_GET_SECRET"),
				Environment: chita.NewRequired(proj.EnvSlug),
			})

		assert.Equal(t, 422, status)
		assert.Equal(t, "ValidationFailure", resp.Error)
	})

	t.Run("missing environment returns 400", func(t *testing.T) {
		resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, chita.ErrorBody](
			t, srv, "GET", "/api/v4/secrets/{secretName}", &secret.GetSecretByNameV4Request{
				SecretName: chita.NewRequired("HTTP_GET_SECRET"),
				ProjectID:  chita.NewRequired(proj.ID),
			})

		assert.Equal(t, 422, status)
		assert.Equal(t, "ValidationFailure", resp.Error)
	})

	t.Run("secret not found returns 404", func(t *testing.T) {
		resp, status := chita.HTTPTest[*secret.GetSecretByNameV4Request, chita.ErrorBody](
			t, srv, "GET", "/api/v4/secrets/{secretName}", &secret.GetSecretByNameV4Request{
				SecretName:  chita.NewRequired("NON_EXISTENT"),
				ProjectID:   chita.NewRequired(proj.ID),
				Environment: chita.NewRequired(proj.EnvSlug),
			})

		assert.Equal(t, 404, status)
		assert.Contains(t, resp.Message, "not found")
	})
}
