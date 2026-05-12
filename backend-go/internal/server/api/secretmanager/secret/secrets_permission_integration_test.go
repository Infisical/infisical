//go:build integration

package secret_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	gensecrets "github.com/infisical/api/internal/server/gen/secrets"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/testutil/infra"
)

// listSecrets is a helper that calls ListSecretsV4 with the given identity context.
func listSecrets(t *testing.T, actorType permission.ActorType, actorID, orgID string, payload *gensecrets.ListSecretsV4Payload) (*gensecrets.ListSecretsResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      actorType,
		ActorID:    uuid.MustParse(actorID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsHandler(t)
	return svc.ListSecretsV4(ctx, payload)
}

// getSecretByName is a helper that calls GetSecretByNameV4 with the given identity context.
func getSecretByName(t *testing.T, actorType permission.ActorType, actorID, orgID string, payload *gensecrets.GetSecretByNameV4Payload) (*gensecrets.GetSecretResult, error) {
	t.Helper()

	ctx := auth.WithIdentity(context.Background(), &auth.Identity{
		AuthMode:   auth.AuthModeIdentityAccessToken,
		Actor:      actorType,
		ActorID:    uuid.MustParse(actorID),
		OrgID:      uuid.MustParse(orgID),
		AuthMethod: "",
	})

	svc := newSecretsHandler(t)
	return svc.GetSecretByNameV4(ctx, payload)
}

// =============================================================================
// Identity Role-Based Access Tests
// =============================================================================

func TestIdentityAdmin_CanReadAllSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "admin-read-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ADMIN_SECRET_1", "value1", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ADMIN_SECRET_2", "value2", nil)

	identity := nodejs.CreateIdentity(t, "admin-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 2)

	for _, secret := range result.Secrets {
		assert.False(t, secret.SecretValueHidden, "admin should see secret values")
		assert.NotEmpty(t, secret.SecretValue, "admin should see secret values")
	}
}

func TestIdentityMember_CanReadAllSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "member-read-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MEMBER_SECRET", "member-value", nil)

	identity := nodejs.CreateIdentity(t, "member-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("member"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)

	assert.False(t, result.Secrets[0].SecretValueHidden, "member should see secret values")
	assert.Equal(t, "member-value", result.Secrets[0].SecretValue)
}

func TestIdentityViewer_CanReadSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "viewer-read-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "VIEWER_SECRET", "viewer-visible-value", nil)

	identity := nodejs.CreateIdentity(t, "viewer-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("viewer"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)

	// Viewer role has ReadValue permission, so they CAN see secret values
	assert.False(t, result.Secrets[0].SecretValueHidden, "viewer should see secret values")
	assert.Equal(t, "viewer-visible-value", result.Secrets[0].SecretValue)
}

func TestIdentityNoAccess_EmptyResult(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "noaccess-read-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "NOACCESS_SECRET", "secret-value", nil)

	identity := nodejs.CreateIdentity(t, "noaccess-secrets-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Empty(t, result.Secrets, "no-access role should see no secrets")
}

func TestIdentityNotMember_Forbidden(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "notmember-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "FORBIDDEN_SECRET", "secret-value", nil)

	// Create identity but do NOT add to project
	identity := nodejs.CreateIdentity(t, "outsider-secrets-identity")

	_, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a member")
}

// =============================================================================
// User Role-Based Access Tests
// =============================================================================

func TestUserAdmin_CanReadSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "user-admin-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "USER_ADMIN_SECRET", "admin-value", nil)

	user := nodejs.InviteAndCreateUser(t, "user-admin-secrets@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{"admin"})

	result, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "admin-value", result.Secrets[0].SecretValue)
}

func TestUserViewer_CanReadSecrets(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "user-viewer-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "USER_VIEWER_SECRET", "user-viewer-value", nil)

	user := nodejs.InviteAndCreateUser(t, "user-viewer-secrets@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{"viewer"})

	result, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	// Viewer role has ReadValue permission, so they CAN see secret values
	assert.False(t, result.Secrets[0].SecretValueHidden, "viewer should see secret values")
	assert.Equal(t, "user-viewer-value", result.Secrets[0].SecretValue)
}

// =============================================================================
// Custom Role Tests
// =============================================================================

func TestIdentityCustomRole_EnvironmentScoped(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "env-scoped-test")
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "dev-only-reader", "Dev Only Reader", []infra.Permission{
		{
			Subject: "secrets",
			Action:  []string{"read"},
			Conditions: map[string]any{
				"environment": "dev",
			},
		},
	})

	identity := nodejs.CreateIdentity(t, "env-scoped-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	// Should see dev secrets
	devResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, devResult.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", devResult.Secrets[0].SecretKey)

	// Should NOT see staging secrets
	stagingResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "staging",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	assert.Empty(t, stagingResult.Secrets, "should not see staging secrets with dev-only role")
}

func TestIdentityCustomRole_PathScoped(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "path-scoped-test")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "app")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/app", "config")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "other")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/app", "APP_SECRET", "app-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/app/config", "CONFIG_SECRET", "config-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/other", "OTHER_SECRET", "other-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "app-reader", "App Path Reader", []infra.Permission{
		{
			Subject: "secrets",
			Action:  []string{"read"},
			Conditions: map[string]any{
				"secretPath": map[string]any{
					"$glob": "/app/**",
				},
			},
		},
	})

	identity := nodejs.CreateIdentity(t, "path-scoped-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	// Should see secrets under /app
	appResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/app",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, appResult.Secrets, 1)
	assert.Equal(t, "APP_SECRET", appResult.Secrets[0].SecretKey)

	// Should see secrets under /app/config
	configResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/app/config",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, configResult.Secrets, 1)
	assert.Equal(t, "CONFIG_SECRET", configResult.Secrets[0].SecretKey)

	// Should NOT see secrets under /other
	otherResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/other",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	assert.Empty(t, otherResult.Secrets, "should not see /other secrets with /app/** role")
}

// =============================================================================
// Group Membership Tests
// =============================================================================

func TestGroupAdmin_UserInheritsAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "group-admin-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "GROUP_ADMIN_SECRET", "group-value", nil)

	group := nodejs.CreateGroup(t, "secrets-admin-group")
	user := nodejs.InviteAndCreateUser(t, "group-admin@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, "admin")

	result, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "group-value", result.Secrets[0].SecretValue)
	assert.False(t, result.Secrets[0].SecretValueHidden)
}

func TestGroupViewer_UserInheritsReadAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "group-viewer-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "GROUP_VIEWER_SECRET", "group-viewer-value", nil)

	group := nodejs.CreateGroup(t, "secrets-viewer-group")
	user := nodejs.InviteAndCreateUser(t, "group-viewer@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, "viewer")

	result, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	// Viewer role has ReadValue permission, so they CAN see secret values
	assert.False(t, result.Secrets[0].SecretValueHidden, "group viewer should see secret values")
	assert.Equal(t, "group-viewer-value", result.Secrets[0].SecretValue)
}

func TestGroupCustomRole_UserInheritsCustomPermissions(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "group-custom-test")
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "group-dev-reader", "Group Dev Reader", []infra.Permission{
		{
			Subject: "secrets",
			Action:  []string{"read"},
			Conditions: map[string]any{
				"environment": "dev",
			},
		},
	})

	group := nodejs.CreateGroup(t, "custom-role-group")
	user := nodejs.InviteAndCreateUser(t, "group-custom@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, customRole.Slug)

	// Should see dev secrets via group's custom role
	devResult, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, devResult.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", devResult.Secrets[0].SecretKey)

	// Should NOT see staging secrets
	stagingResult, err := listSecrets(t, permission.ActorTypeUser, user.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "staging",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	assert.Empty(t, stagingResult.Secrets)
}

// =============================================================================
// Additional Privilege Tests
// =============================================================================

func TestIdentityAdditionalPrivilege_ExtendsRole(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "addl-priv-test")
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	identity := nodejs.CreateIdentity(t, "addl-priv-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "read",
			Conditions: map[string]any{
				"environment": "dev",
			},
		},
	}, nil)

	// Should see dev secrets via additional privilege
	devResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, devResult.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", devResult.Secrets[0].SecretKey)

	// Should NOT see staging secrets
	stagingResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "staging",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	assert.Empty(t, stagingResult.Secrets)
}

func TestIdentityMultipleAdditionalPrivileges_Merge(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "multi-addl-priv-test")
	// Note: "staging" environment is pre-created with the project

	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	identity := nodejs.CreateIdentity(t, "multi-addl-priv-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))

	// Add two separate additional privileges
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "read",
			Conditions: map[string]any{
				"environment": "dev",
			},
		},
	}, nil)
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "read",
			Conditions: map[string]any{
				"environment": "staging",
			},
		},
	}, nil)

	// Should see dev secrets
	devResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "dev",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, devResult.Secrets, 1)

	// Should also see staging secrets (merged privileges)
	stagingResult, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     "staging",
		SecretPath:      "/",
		ViewSecretValue: true,
	})
	require.NoError(t, err)
	require.Len(t, stagingResult.Secrets, 1)
}

// =============================================================================
// Temporary Access Tests
// =============================================================================

func TestIdentityTemporaryRole_ActiveGrantsAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "temp-active-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TEMP_SECRET", "temp-value", nil)

	identity := nodejs.CreateIdentity(t, "temp-active-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, []infra.RoleAssignment{
		{
			Role:        "no-access",
			IsTemporary: false,
		},
		{
			Role:                     "admin",
			IsTemporary:              true,
			TemporaryMode:            "relative",
			TemporaryRange:           "1h",
			TemporaryAccessStartTime: time.Now().UTC().Format(time.RFC3339),
		},
	})

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "temp-value", result.Secrets[0].SecretValue)
}

func TestIdentityTemporaryRole_ExpiredDeniesAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "temp-expired-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "EXPIRED_SECRET", "expired-value", nil)

	identity := nodejs.CreateIdentity(t, "temp-expired-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, []infra.RoleAssignment{
		{
			Role:        "no-access",
			IsTemporary: false,
		},
		{
			Role:                     "admin",
			IsTemporary:              true,
			TemporaryMode:            "relative",
			TemporaryRange:           "1h",
			TemporaryAccessStartTime: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
		},
	})

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Empty(t, result.Secrets, "expired temporary role should not grant access")
}

func TestIdentityTemporaryRole_MixedWithPermanent(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "temp-mixed-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "MIXED_SECRET", "mixed-value", nil)

	identity := nodejs.CreateIdentity(t, "temp-mixed-identity")
	// Permanent viewer + expired temporary admin
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, []infra.RoleAssignment{
		{
			Role:        "viewer",
			IsTemporary: false,
		},
		{
			Role:                     "admin",
			IsTemporary:              true,
			TemporaryMode:            "relative",
			TemporaryRange:           "1h",
			TemporaryAccessStartTime: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
		},
	})

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	// Permanent viewer has ReadValue permission, so they CAN see secret values
	assert.False(t, result.Secrets[0].SecretValueHidden, "viewer role should allow reading values")
	assert.Equal(t, "mixed-value", result.Secrets[0].SecretValue)
}

func TestIdentityTemporaryAdditionalPrivilege_Active(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "temp-addl-active-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TEMP_ADDL_SECRET", "temp-addl-value", nil)

	identity := nodejs.CreateIdentity(t, "temp-addl-active-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "read",
		},
	}, &infra.IdentityPrivilegeOpts{TemporaryRange: "1h", TemporaryAccessStartTime: time.Now().UTC().Format(time.RFC3339)})

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.Equal(t, "temp-addl-value", result.Secrets[0].SecretValue)
}

func TestIdentityTemporaryAdditionalPrivilege_Expired(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "temp-addl-expired-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "EXPIRED_ADDL_SECRET", "expired-value", nil)

	identity := nodejs.CreateIdentity(t, "temp-addl-expired-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "read",
		},
	}, &infra.IdentityPrivilegeOpts{TemporaryRange: "1h", TemporaryAccessStartTime: time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)})

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	assert.Empty(t, result.Secrets, "expired temporary additional privilege should not grant access")
}

// =============================================================================
// ViewSecretValue Permission Tests
// =============================================================================

func TestViewSecretValue_False_HidesValues(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "view-value-false-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "HIDDEN_VALUE_SECRET", "should-be-hidden", nil)

	identity := nodejs.CreateIdentity(t, "view-value-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: false,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.True(t, result.Secrets[0].SecretValueHidden, "value should be hidden when viewSecretValue=false")
	assert.Equal(t, "<hidden-by-infisical>", result.Secrets[0].SecretValue, "value should be masked when viewSecretValue=false")
}

func TestViewSecretValue_True_ShowsValues(t *testing.T) {
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "view-value-true-test")
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "VISIBLE_VALUE_SECRET", "should-be-visible", nil)

	identity := nodejs.CreateIdentity(t, "view-value-true-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result, err := listSecrets(t, permission.ActorTypeIdentity, identity.ID, nodejs.OrgID(), &gensecrets.ListSecretsV4Payload{
		ProjectID:       proj.ID,
		Environment:     proj.EnvSlug,
		SecretPath:      "/",
		ViewSecretValue: true,
	})

	require.NoError(t, err)
	require.Len(t, result.Secrets, 1)
	assert.False(t, result.Secrets[0].SecretValueHidden, "value should not be hidden when viewSecretValue=true")
	assert.Equal(t, "should-be-visible", result.Secrets[0].SecretValue)
}

// =============================================================================
// GetSecretByName Import Permission Tests
// =============================================================================

func TestGetSecretByName_ImportPermissions(t *testing.T) {
	nodejs := stack.NodeJS()

	// Setup: Create project with imports and different permission levels
	proj := nodejs.CreateProject(t, "get-secret-import-perm-test")

	// Create secrets in staging (the import source)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "ANOTHER_STAGING", "another-staging-value", nil)

	// Create a direct secret in dev
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_DIRECT", "dev-direct-value", nil)

	// Create import in dev that imports from staging
	nodejs.CreateSecretImport(t, proj.ID, "dev", "/", "staging", "/")

	// Create identity with dev-only permission (cannot read staging)
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

	// Create identity with admin permission (can read all)
	adminIdentity := nodejs.CreateIdentity(t, "admin-identity")
	nodejs.AddIdentityToProject(t, proj.ID, adminIdentity.ID, infra.Role("admin"))

	t.Run("direct secret allowed with env-scoped permission", func(t *testing.T) {
		result, err := getSecretByName(t, permission.ActorTypeIdentity, devOnlyIdentity.ID, nodejs.OrgID(), &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "DEV_DIRECT",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  false,
		})

		require.NoError(t, err)
		assert.Equal(t, "DEV_DIRECT", result.Secret.SecretKey)
		assert.Equal(t, "dev-direct-value", result.Secret.SecretValue)
	})

	t.Run("imported secret denied without source env permission", func(t *testing.T) {
		// Request secret via dev, but it's actually in staging
		// dev-only identity should NOT be able to read it
		_, err := getSecretByName(t, permission.ActorTypeIdentity, devOnlyIdentity.ID, nodejs.OrgID(), &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "STAGING_SECRET",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  true,
		})

		require.Error(t, err, "should deny access to imported secret when lacking source env permission")
		assert.Contains(t, err.Error(), "permission")
	})

	t.Run("imported secret allowed with admin permission", func(t *testing.T) {
		result, err := getSecretByName(t, permission.ActorTypeIdentity, adminIdentity.ID, nodejs.OrgID(), &gensecrets.GetSecretByNameV4Payload{
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
	})

	t.Run("imported secret not found when includeImports is false", func(t *testing.T) {
		_, err := getSecretByName(t, permission.ActorTypeIdentity, adminIdentity.ID, nodejs.OrgID(), &gensecrets.GetSecretByNameV4Payload{
			SecretName:      "STAGING_SECRET",
			ProjectID:       proj.ID,
			Environment:     "dev",
			SecretPath:      "/",
			ViewSecretValue: true,
			IncludeImports:  false,
		})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "not found")
	})
}
