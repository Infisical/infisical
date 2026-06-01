//go:build integration

package secrets_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/tests/infra"
)

// =============================================================================
// GetSecretByName Import Permission Tests
// =============================================================================

func TestGetSecretByName_ImportPermissions(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "get-secret-import-perm-test")

	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "ANOTHER_STAGING", "another-staging-value", nil)

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_DIRECT", "dev-direct-value", nil)

	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	devOnlyRole := nodejs.CreateCustomProjectRole(t, proj.ID, "dev-only-reader", "Dev Only", []infra.Permission{
		{
			Subject: "secrets",
			Action:  []string{"read"},
			Conditions: map[string]any{
				"environment": "dev",
			},
		},
	})
	devOnlyIdentity := nodejs.CreateIdentity(t, "dev-only-identity")
	nodejs.AddIdentityToProject(t, proj.ID, devOnlyIdentity.ID, infra.Role(devOnlyRole.Slug))

	adminIdentity := nodejs.CreateIdentity(t, "admin-identity")
	nodejs.AddIdentityToProject(t, proj.ID, adminIdentity.ID, infra.Role("admin"))

	t.Run("direct secret allowed with env-scoped permission", func(t *testing.T) {
		result, err := getSecretByName(t, auth.ActorTypeIdentity, devOnlyIdentity.ID, nodejs.OrgID(), "DEV_DIRECT", &GetSecretByNameV4Params{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(false),
		})

		require.NoError(t, err)
		assert.Equal(t, "DEV_DIRECT", result.Secret.SecretKey)
		assert.Equal(t, "dev-direct-value", result.Secret.SecretValue)
	})

	t.Run("imported secret denied without source env permission", func(t *testing.T) {
		_, err := getSecretByName(t, auth.ActorTypeIdentity, devOnlyIdentity.ID, nodejs.OrgID(), "STAGING_SECRET", &GetSecretByNameV4Params{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(true),
		})

		require.Error(t, err, "should deny access to imported secret when lacking source env permission")
		assert.Contains(t, err.Error(), "Permission")
	})

	t.Run("imported secret allowed with admin permission", func(t *testing.T) {
		result, err := getSecretByName(t, auth.ActorTypeIdentity, adminIdentity.ID, nodejs.OrgID(), "STAGING_SECRET", &GetSecretByNameV4Params{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(true),
		})

		require.NoError(t, err)
		assert.Equal(t, "STAGING_SECRET", result.Secret.SecretKey)
		assert.Equal(t, "staging-value", result.Secret.SecretValue)
		assert.Equal(t, "staging", result.Secret.Environment, "should return actual source environment")
	})

	t.Run("imported secret not found when includeImports is false", func(t *testing.T) {
		_, err := getSecretByName(t, auth.ActorTypeIdentity, adminIdentity.ID, nodejs.OrgID(), "STAGING_SECRET", &GetSecretByNameV4Params{
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      new("/"),
			ViewSecretValue: new(true),
			IncludeImports:  new(false),
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}
