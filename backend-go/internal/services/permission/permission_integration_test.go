//go:build integration

package permission_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/project"
	"github.com/infisical/api/internal/testutil"
	"github.com/infisical/api/internal/testutil/infra"
)

var (
	stack *infra.Stack
	proj  *infra.ProjectSeed
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups").
		MustStart()

	proj = stack.NodeJS().MustCreateProject("perm-test")
	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

func newPermissionService() *permission.Service {
	dal := permission.NewDAL(stack.DB())
	return permission.NewService(testutil.NopLogger(), permission.Deps{DAL: dal})
}

func getProjectPermission(t *testing.T, actorType permission.ActorType, actorID string) *permission.GetProjectPermissionResult {
	t.Helper()
	ctx := context.Background()
	svc := newPermissionService()

	result, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             actorType,
		ActorID:           uuid.MustParse(actorID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(stack.NodeJS().OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.NoError(t, err)
	require.NotNil(t, result)
	return result
}

// ===========================
// Identity role tests
// ===========================

func TestIdentityAdmin_CanDoEverything(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "admin-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Secrets CRUD
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	// Secret folders CRUD
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionEdit, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionDelete, project.SecretFolderSubject{}))

	// Members
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionEdit, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionDelete, project.MemberSubject{}))

	// Project management
	assert.True(t, gocasl.Can(ability, project.ProjectActionEdit, project.ProjectSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	// Roles
	assert.True(t, gocasl.Can(ability, project.RoleActionRead, project.RoleSubject{}))
	assert.True(t, gocasl.Can(ability, project.RoleActionCreate, project.RoleSubject{}))

	// Identity management
	assert.True(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionCreate, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))

	// Environments
	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionRead, project.EnvironmentsSubject{}))
	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionCreate, project.EnvironmentsSubject{}))

	// HasRole
	assert.True(t, result.HasRole("admin"))
	assert.False(t, result.HasRole("viewer"))
}

func TestIdentityMember_LimitedAccess(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "member-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "member")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Members CAN read/create/edit/delete secrets
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	// Members CAN manage secret folders
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))

	// Members CANNOT delete project
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	// Members CANNOT grant privileges
	assert.False(t, gocasl.Can(ability, project.MemberActionGrantPrivileges, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))

	// HasRole
	assert.True(t, result.HasRole("member"))
	assert.False(t, result.HasRole("admin"))
}

func TestIdentityViewer_ReadOnly(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "viewer-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "viewer")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Viewers CAN read (viewer has describeSecret + readValue, not the combined "read" action)
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionRead, project.EnvironmentsSubject{}))
	assert.True(t, gocasl.Can(ability, project.TagsActionRead, project.TagsSubject{}))
	assert.True(t, gocasl.Can(ability, project.RoleActionRead, project.RoleSubject{}))
	assert.True(t, gocasl.Can(ability, project.AuditLogsActionRead, project.AuditLogsSubject{}))

	// Viewer does NOT have the combined "read" (describeAndReadValue) action
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	// Viewers CANNOT write secrets
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	// Viewers CANNOT write folders
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionEdit, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionDelete, project.SecretFolderSubject{}))

	// Viewers CANNOT manage members
	assert.False(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionDelete, project.MemberSubject{}))

	// Viewers CANNOT delete project
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	// Viewers CANNOT manage dynamic secrets
	assert.False(t, gocasl.Can(ability, project.DynamicSecretActionCreateRootCredential, project.DynamicSecretSubject{}))

	// HasRole
	assert.True(t, result.HasRole("viewer"))
}

func TestIdentityNoAccess_DeniedEverything(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "no-access-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "no-access")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// No-access CANNOT do anything
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))

	// HasRole
	assert.True(t, result.HasRole("no-access"))
}

func TestIdentityNotMember_Forbidden(t *testing.T) {
	nodejs := stack.NodeJS()
	// Create identity but do NOT add to project
	identity := nodejs.CreateIdentity(t, "outsider-identity")

	ctx := context.Background()
	svc := newPermissionService()

	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a member")
}

// ===========================
// User role tests
// ===========================

func TestUserAdmin_CanDoEverything(t *testing.T) {
	nodejs := stack.NodeJS()
	user := nodejs.InviteAndCreateUser(t, "admin-user@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{"admin"})

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// Admin can do everything
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))

	assert.True(t, result.HasRole("admin"))
}

func TestUserViewer_ReadOnly(t *testing.T) {
	nodejs := stack.NodeJS()
	user := nodejs.InviteAndCreateUser(t, "viewer-user@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{"viewer"})

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// Can read (viewer has describeSecret + readValue, not combined "read")
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))

	// Cannot write
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	assert.True(t, result.HasRole("viewer"))
}

// ===========================
// Wrong org / wrong project type
// ===========================

func TestWrongOrgID_Forbidden(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "wrong-org-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	ctx := context.Background()
	svc := newPermissionService()

	fakeOrgID := uuid.New()
	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        fakeOrgID,
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "does not belong")
}

func TestWrongProjectType_BadRequest(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "wrong-type-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "admin")

	ctx := context.Background()
	svc := newPermissionService()

	// Project is secret-manager, but we request certificate-manager
	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeCertificateManager,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not allowed")
}

func TestProjectTypeAny_Allowed(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "any-type-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "viewer")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	// ActionProjectTypeAny is used by getProjectPermission helper via ActionProjectTypeSecretManager,
	// but let's test Any explicitly
	ctx := context.Background()
	svc := newPermissionService()
	resultAny, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeAny,
	})
	require.NoError(t, err)
	require.NotNil(t, resultAny)

	// Both should produce same abilities (viewer has describeSecret, not combined "read")
	assert.True(t, gocasl.Can(result.Permission.Ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(resultAny.Permission.Ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
}

// ===========================
// Non-existent project
// ===========================

func TestNonExistentProject_NotFound(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "ghost-project-identity")

	ctx := context.Background()
	svc := newPermissionService()

	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         "non-existent-project-id",
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

// ===========================
// Membership results
// ===========================

func TestMemberships_ReturnedCorrectly(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "membership-check-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "member")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)

	require.NotEmpty(t, result.Memberships, "memberships should not be empty")
	assert.True(t, result.HasRole("member"))
	assert.False(t, result.HasRole("admin"))
	assert.False(t, result.HasRole("viewer"))
}

// ===========================
// Project enforcement
// ===========================

func TestHasProjectEnforcement_ReturnsFunction(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "enforcement-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "viewer")

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)

	require.NotNil(t, result.HasProjectEnforcement)
	// Default project should not have encrypted metadata enforcement
	assert.False(t, result.HasProjectEnforcement("enforceEncryptedSecretManagerSecretMetadata"))
	// Unknown enforcement should return false
	assert.False(t, result.HasProjectEnforcement("nonExistentEnforcement"))
}

// ===========================
// Custom role tests
// ===========================

func TestIdentityCustomRole_SecretsReadCreateOnly(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a custom role that allows only reading and creating secrets
	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "secrets-read-create", "Secrets Read Create", []map[string]any{
		{
			"subject": "secrets",
			"action":  []string{"read", "create"},
		},
	})

	identity := nodejs.CreateIdentity(t, "custom-role-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, customRole.Slug)

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// CAN read and create secrets
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))

	// CANNOT edit or delete secrets
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	// CANNOT do anything else
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionEdit, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))

	// HasRole returns the custom role slug
	assert.True(t, result.HasRole(customRole.Slug))
	assert.False(t, result.HasRole("admin"))
	assert.False(t, result.HasRole("member"))
}

func TestUserCustomRole_SecretsReadCreateOnly(t *testing.T) {
	nodejs := stack.NodeJS()

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "user-secrets-rc", "User Secrets Read Create", []map[string]any{
		{
			"subject": "secrets",
			"action":  []string{"read", "create"},
		},
	})

	user := nodejs.InviteAndCreateUser(t, "custom-role-user@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{customRole.Slug})

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// CAN read and create secrets
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))

	// CANNOT edit or delete secrets
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	// CANNOT do anything else
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	assert.True(t, result.HasRole(customRole.Slug))
}

func TestIdentityCustomRole_EnvironmentScoped(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a custom role that allows reading secrets only in "dev" environment
	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "dev-reader", "Dev Secret Reader", []map[string]any{
		{
			"subject": "secrets",
			"action":  []string{"read"},
			"conditions": map[string]any{
				"environment": "dev",
			},
		},
	})

	identity := nodejs.CreateIdentity(t, "env-scoped-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, customRole.Slug)

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// CAN read secrets in "dev" environment
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "dev"}))

	// CANNOT read secrets in other environments
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "production"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "staging"}))

	// CANNOT read secrets without specifying environment (empty doesn't match "dev")
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	// CANNOT create/edit/delete even in dev
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{Environment: "dev"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{Environment: "dev"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{Environment: "dev"}))
}

func TestIdentityCustomRole_GlobSecretPath(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a custom role with $glob condition on secretPath
	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "path-reader", "Path Scoped Reader", []map[string]any{
		{
			"subject": "secrets",
			"action":  []string{"read"},
			"conditions": map[string]any{
				"secretPath": map[string]any{
					"$glob": "/app/**",
				},
			},
		},
	})

	identity := nodejs.CreateIdentity(t, "glob-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, customRole.Slug)

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// CAN read secrets under /app/
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/app/config"}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/app/nested/deep"}))

	// CANNOT read secrets outside /app/
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/other/path"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/"}))

	// CANNOT read without path (empty doesn't match /app/**)
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
}

// ===========================
// Group role tests
// ===========================

func TestGroupAdmin_UserInheritsFullAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	group := nodejs.CreateGroup(t, "admin-group")
	user := nodejs.InviteAndCreateUser(t, "group-admin@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, "admin")

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// User inherits admin permissions through group
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))
}

func TestGroupViewer_UserInheritsReadOnly(t *testing.T) {
	nodejs := stack.NodeJS()

	group := nodejs.CreateGroup(t, "viewer-group")
	user := nodejs.InviteAndCreateUser(t, "group-viewer@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, "viewer")

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// User inherits viewer permissions through group (describeSecret + readValue, not combined "read")
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))

	// Cannot write
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

func TestGroupCustomRole_UserInheritsCustomPermissions(t *testing.T) {
	nodejs := stack.NodeJS()

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "group-secrets-ro", "Group Secrets ReadOnly", []map[string]any{
		{
			"subject": "secrets",
			"action":  []string{"read"},
		},
		{
			"subject": "secret-folders",
			"action":  []string{"read"},
		},
	})

	group := nodejs.CreateGroup(t, "custom-role-group")
	user := nodejs.InviteAndCreateUser(t, "group-custom@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, customRole.Slug)

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// CAN read secrets and folders through group's custom role
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))

	// CANNOT write secrets or folders
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))

	// CANNOT do anything else
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionEdit, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))

	assert.True(t, result.HasRole(customRole.Slug))
}

func TestGroupNotMember_UserDenied(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create group and add to project, but user is NOT in the group
	group := nodejs.CreateGroup(t, "exclusive-group")
	nodejs.AddGroupToProject(t, proj.ID, group.ID, "admin")

	user := nodejs.InviteAndCreateUser(t, "not-in-group@test.local")

	ctx := context.Background()
	svc := newPermissionService()

	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeUser,
		ActorID:           uuid.MustParse(user.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not a member")
}

// ===========================
// Additional privilege tests
// ===========================

func TestIdentityAdditionalPrivilege_ExtendsRole(t *testing.T) {
	nodejs := stack.NodeJS()

	// Give identity viewer role (read-only) then add additional privilege for secret creation
	identity := nodejs.CreateIdentity(t, "addl-priv-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "viewer")
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "create",
		},
	})

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Base viewer permissions still work
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))

	// Additional privilege grants create
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))

	// Still cannot edit/delete (not in viewer or additional privilege)
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
}

func TestIdentityAdditionalPrivilege_WithConditions(t *testing.T) {
	nodejs := stack.NodeJS()

	// Give identity no-access role, then add scoped additional privilege
	identity := nodejs.CreateIdentity(t, "addl-priv-scoped-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "no-access")
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "read",
			"conditions": map[string]any{
				"environment": "dev",
			},
		},
	})

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// CAN read secrets in dev via additional privilege
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "dev"}))

	// CANNOT read in other environments
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "production"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	// CANNOT write even in dev
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{Environment: "dev"}))
}

func TestUserAdditionalPrivilege_ExtendsRole(t *testing.T) {
	nodejs := stack.NodeJS()

	// The user additional privilege API is JWT-only (no identity token).
	// Add bootstrap admin user to project so their userToken can make the call.
	nodejs.AddUserToProject(t, proj.ID, nodejs.UserEmail(), []string{"admin"})

	// Give user viewer role, then add additional privilege for secret edit
	user := nodejs.InviteAndCreateUser(t, "addl-priv-user@test.local")
	nodejs.AddUserToProject(t, proj.ID, user.Email, []string{"viewer"})
	nodejs.CreateUserAdditionalPrivilege(t, user.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "edit",
		},
	})

	result := getProjectPermission(t, permission.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	// Base viewer permissions
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))

	// Additional privilege grants edit
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))

	// Still cannot create/delete
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
}

func TestIdentityMultipleAdditionalPrivileges_Merge(t *testing.T) {
	nodejs := stack.NodeJS()

	// Give identity no-access role, add two separate additional privileges
	identity := nodejs.CreateIdentity(t, "multi-addl-priv-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "no-access")

	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "read",
		},
	})
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secret-folders",
			"action":  "read",
		},
	})

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Both additional privileges are merged
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))

	// Nothing else
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
}

// ===========================
// Temporary role tests
// ===========================

func TestIdentityTemporaryRole_ActiveGrantsAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-role-active-identity")
	// API requires at least one permanent role; use no-access as the permanent base
	nodejs.AddIdentityToProjectWithRoles(t, proj.ID, identity.ID, []map[string]any{
		{
			"role":        "no-access",
			"isTemporary": false,
		},
		{
			"role":                     "admin",
			"isTemporary":              true,
			"temporaryMode":            "relative",
			"temporaryRange":           "1h",
			"temporaryAccessStartTime": time.Now().UTC().Format(time.RFC3339),
		},
	})

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Active temporary admin role grants full access
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

func TestIdentityTemporaryRole_ExpiredDeniesAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-role-expired-identity")
	// Permanent no-access + expired temporary admin (started 2h ago, range 1h)
	nodejs.AddIdentityToProjectWithRoles(t, proj.ID, identity.ID, []map[string]any{
		{
			"role":        "no-access",
			"isTemporary": false,
		},
		{
			"role":                     "admin",
			"isTemporary":              true,
			"temporaryMode":            "relative",
			"temporaryRange":           "1h",
			"temporaryAccessStartTime": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
		},
	})

	// Identity is a project member but the only role is expired → no permissions
	ctx := context.Background()
	svc := newPermissionService()
	result, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             permission.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.NoError(t, err)
	ability := result.Permission.Ability

	// Expired temporary role grants nothing
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
}

func TestIdentityTemporaryRole_MixedWithPermanent(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-role-mixed-identity")
	// Permanent viewer + expired temporary admin
	nodejs.AddIdentityToProjectWithRoles(t, proj.ID, identity.ID, []map[string]any{
		{
			"role":        "viewer",
			"isTemporary": false,
		},
		{
			"role":                     "admin",
			"isTemporary":              true,
			"temporaryMode":            "relative",
			"temporaryRange":           "1h",
			"temporaryAccessStartTime": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
		},
	})

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Permanent viewer permissions still work
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))

	// Expired admin does NOT contribute write permissions
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

// ===========================
// Temporary additional privilege tests
// ===========================

func TestIdentityTemporaryAdditionalPrivilege_ActiveGrantsAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-addl-active-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "no-access")
	nodejs.CreateIdentityTemporaryAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "read",
		},
	}, "1h", time.Now().UTC().Format(time.RFC3339))

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Active temporary additional privilege grants read
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	// But not write
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
}

func TestIdentityTemporaryAdditionalPrivilege_ExpiredDeniesAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-addl-expired-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, "no-access")
	// Start 2h ago, range 1h → expired
	nodejs.CreateIdentityTemporaryAdditionalPrivilege(t, identity.ID, proj.ID, []map[string]any{
		{
			"subject": "secrets",
			"action":  "read",
		},
	}, "1h", time.Now().Add(-2*time.Hour).UTC().Format(time.RFC3339))

	result := getProjectPermission(t, permission.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	// Expired temporary additional privilege grants nothing (base role is no-access)
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
}
