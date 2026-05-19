//go:build integration

package secret_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/testutil/infra"
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "PLAIN_SECRET",
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "PLAIN_SECRET", result.Secret.SecretKey)
	assert.Equal(t, "plain-value", result.Secret.SecretValue)
}

func TestGetSecretByName_WithExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-expansion-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "PORT", "5432", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:${PORT}", nil)

	identity := nodejs.CreateIdentity(t, "get-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:             "ENDPOINT",
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey)
	assert.Equal(t, "myhost.com:5432", result.Secret.SecretValue, "should expand references")
}

func TestGetSecretByName_WithoutExpansion(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-no-expansion-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HOST", "myhost.com", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ENDPOINT", "${HOST}:8080", nil)

	identity := nodejs.CreateIdentity(t, "get-no-expansion-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:             "ENDPOINT",
		ProjectID:              proj.ID,
		Environment:            proj.EnvSlug,
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: false,
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey)
	assert.Equal(t, "${HOST}:8080", result.Secret.SecretValue, "should not expand references")
}

func TestGetSecretByName_NotFound(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-not-found-test")

	identity := nodejs.CreateIdentity(t, "get-not-found-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	_, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "NON_EXISTENT_SECRET",
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "COMMENTED_SECRET",
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "COMMENTED_SECRET", result.Secret.SecretKey)
	assert.Equal(t, "This is a comment for the secret", result.Secret.SecretComment)
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "METADATA_SECRET",
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "METADATA_SECRET", result.Secret.SecretKey)
	require.NotEmpty(t, result.Secret.SecretMetadata)

	metadataMap := make(map[string]string)
	for _, m := range result.Secret.SecretMetadata {
		metadataMap[m.Key] = m.Value
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:             "ENDPOINT",
		ProjectID:              proj.ID,
		Environment:            "dev",
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "ENDPOINT", result.Secret.SecretKey)
	assert.Equal(t, "https://api.example.com/v1/users", result.Secret.SecretValue,
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:             "FULL_DSN",
		ProjectID:              proj.ID,
		Environment:            "dev",
		SecretPath:             "/",
		ViewSecretValue:        true,
		ExpandSecretReferences: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "FULL_DSN", result.Secret.SecretKey)
	assert.Equal(t, "postgres://user@db.example.com:5432/mydb", result.Secret.SecretValue,
		"should expand nested references without imports")
}

// =============================================================================
// V3 Raw Endpoint Tests
// =============================================================================

func TestGetSecretByNameRawV3_WithWorkspaceSlug(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "v3-get-slug-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "V3_SECRET", "v3-value", nil)

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      auth.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	env := proj.EnvSlug
	result, err := svc.GetSecretByNameRawV3(ctx, &gensecrets.GetSecretByNameRawV3Payload{
		SecretName:      "V3_SECRET",
		WorkspaceSlug:   &proj.Slug,
		Environment:     &env,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "V3_SECRET", result.Secret.SecretKey)
	assert.Equal(t, "v3-value", result.Secret.SecretValue)
}

func TestGetSecretByNameRawV3_WithWorkspaceId(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "v3-get-id-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "V3_ID_SECRET", "v3-id-value", nil)

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeJWT,
		Actor:      auth.ActorTypeUser,
		ActorID:    uuid.MustParse(nodejs.UserID()),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	env := proj.EnvSlug
	result, err := svc.GetSecretByNameRawV3(ctx, &gensecrets.GetSecretByNameRawV3Payload{
		SecretName:      "V3_ID_SECRET",
		WorkspaceID:     &proj.ID,
		Environment:     &env,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Equal(t, "V3_ID_SECRET", result.Secret.SecretKey)
	assert.Equal(t, "v3-id-value", result.Secret.SecretValue)
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

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	result, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "STAGING_SECRET",
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  true,
	})

	require.NoError(t, err)
	assert.Equal(t, "STAGING_SECRET", result.Secret.SecretKey)
	assert.Equal(t, "staging-value", result.Secret.SecretValue)
	assert.Equal(t, "staging", result.Secret.Environment, "should return actual source environment")
}

func TestGetSecretByName_ImportNotFoundWhenExcluded(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-import-excluded-test")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_ONLY", "staging-value", nil)
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	identity := nodejs.CreateIdentity(t, "get-import-excluded-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	svc := newSecretsHandler(t)
	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      auth.ActorTypeIdentity,
		ActorID:    uuid.MustParse(identity.ID),
		OrgID:      uuid.MustParse(nodejs.OrgID()),
		AuthMethod: "",
	})

	_, err := svc.GetSecretByNameV4(ctx, &gensecrets.GetSecretByNameV4Payload{
		SecretName:      "STAGING_ONLY",
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
		IncludeImports:  false,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}
