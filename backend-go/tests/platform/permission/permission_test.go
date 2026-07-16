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

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/project"
	"github.com/infisical/api/tests/infra"
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
	return permission.NewService(context.Background(), infra.NopLogger(), &permission.Deps{DB: stack.DB()})
}

func getProjectPermission(t *testing.T, actorType auth.ActorType, actorID string) *permission.GetProjectPermissionResult {
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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionEdit, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionDelete, project.SecretFolderSubject{}))

	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionEdit, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionDelete, project.MemberSubject{}))

	assert.True(t, gocasl.Can(ability, project.ProjectActionEdit, project.ProjectSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	assert.True(t, gocasl.Can(ability, project.RoleActionRead, project.RoleSubject{}))
	assert.True(t, gocasl.Can(ability, project.RoleActionCreate, project.RoleSubject{}))

	assert.True(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionCreate, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))

	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionRead, project.EnvironmentsSubject{}))
	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionCreate, project.EnvironmentsSubject{}))

	assert.True(t, result.HasRole("admin"))
	assert.False(t, result.HasRole("viewer"))
}

func TestIdentityMember_LimitedAccess(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "member-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("member"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))

	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	assert.False(t, gocasl.Can(ability, project.MemberActionGrantPrivileges, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, project.IdentitySubject{}))

	assert.True(t, result.HasRole("member"))
	assert.False(t, result.HasRole("admin"))
}

func TestIdentityViewer_ReadOnly(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "viewer-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("viewer"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))
	assert.True(t, gocasl.Can(ability, project.EnvironmentsActionRead, project.EnvironmentsSubject{}))
	assert.True(t, gocasl.Can(ability, project.TagsActionRead, project.TagsSubject{}))
	assert.True(t, gocasl.Can(ability, project.RoleActionRead, project.RoleSubject{}))
	assert.True(t, gocasl.Can(ability, project.AuditLogsActionRead, project.AuditLogsSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretFolderActionCreate, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionEdit, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionDelete, project.SecretFolderSubject{}))

	assert.False(t, gocasl.Can(ability, project.MemberActionCreate, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionDelete, project.MemberSubject{}))

	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))

	assert.False(t, gocasl.Can(ability, project.DynamicSecretActionCreateRootCredential, project.DynamicSecretSubject{}))

	assert.True(t, result.HasRole("viewer"))
}

func TestIdentityNoAccess_DeniedEverything(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "no-access-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))

	assert.True(t, result.HasRole("no-access"))
}

func TestIdentityNotMember_Forbidden(t *testing.T) {
	nodejs := stack.NodeJS()
	identity := nodejs.CreateIdentity(t, "outsider-identity")

	ctx := context.Background()
	svc := newPermissionService()

	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeIdentity,
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

	result := getProjectPermission(t, auth.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

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

	result := getProjectPermission(t, auth.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))

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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	ctx := context.Background()
	svc := newPermissionService()

	fakeOrgID := uuid.New()
	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeIdentity,
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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	ctx := context.Background()
	svc := newPermissionService()

	_, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeIdentity,
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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("viewer"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ctx := context.Background()
	svc := newPermissionService()
	resultAny, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeAny,
	})
	require.NoError(t, err)
	require.NotNil(t, resultAny)

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
		Actor:             auth.ActorTypeIdentity,
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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("member"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)

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
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("viewer"))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)

	require.NotNil(t, result.HasProjectEnforcement)
	assert.False(t, result.HasProjectEnforcement("enforceEncryptedSecretManagerSecretMetadata"))
	assert.False(t, result.HasProjectEnforcement("nonExistentEnforcement"))
}

// ===========================
// Custom role tests
// ===========================

func TestIdentityCustomRole_SecretsReadCreateOnly(t *testing.T) {
	nodejs := stack.NodeJS()

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "secrets-read-create", "Secrets Read Create", []infra.Permission{
		{
			Subject: "secrets",
			Action:  []string{"read", "create"},
		},
	})

	identity := nodejs.CreateIdentity(t, "custom-role-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionEdit, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.IdentityActionRead, project.IdentitySubject{}))

	assert.True(t, result.HasRole(customRole.Slug))
	assert.False(t, result.HasRole("admin"))
	assert.False(t, result.HasRole("member"))
}

func TestIdentityCustomRole_EnvironmentScoped(t *testing.T) {
	nodejs := stack.NodeJS()

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "dev-reader", "Dev Secret Reader", []infra.Permission{
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

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "dev"}))

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "production"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{Environment: "staging"}))

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{Environment: "dev"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{Environment: "dev"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{Environment: "dev"}))
}

func TestIdentityCustomRole_GlobSecretPath(t *testing.T) {
	nodejs := stack.NodeJS()

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "path-reader", "Path Scoped Reader", []infra.Permission{
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

	identity := nodejs.CreateIdentity(t, "glob-path-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/app/config"}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/app/nested/deep"}))

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/other/path"}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{SecretPath: "/"}))

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

	result := getProjectPermission(t, auth.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

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

	result := getProjectPermission(t, auth.ActorTypeUser, user.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

// ===========================
// Additional privilege tests
// ===========================

func TestIdentityAdditionalPrivilege_ExtendsRole(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "addl-priv-identity")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("viewer"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{
			Subject: "secrets",
			Action:  "create",
		},
	}, nil)

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))

	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))

	assert.False(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
}

// ===========================
// Temporary role tests
// ===========================

func TestIdentityTemporaryRole_ActiveGrantsAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-role-active-identity")
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

	result := getProjectPermission(t, auth.ActorTypeIdentity, identity.ID)
	ability := result.Permission.Ability

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, project.SecretSubject{}))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

func TestIdentityTemporaryRole_ExpiredDeniesAccess(t *testing.T) {
	nodejs := stack.NodeJS()

	identity := nodejs.CreateIdentity(t, "temp-role-expired-identity")
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

	ctx := context.Background()
	svc := newPermissionService()
	result, err := svc.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeIdentity,
		ActorID:           uuid.MustParse(identity.ID),
		ProjectID:         proj.ID,
		ActorAuthMethod:   "",
		ActorOrgID:        uuid.MustParse(nodejs.OrgID()),
		ActionProjectType: permission.ActionProjectTypeSecretManager,
	})
	require.NoError(t, err)
	ability := result.Permission.Ability

	assert.False(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.False(t, gocasl.Can(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.False(t, gocasl.Can(ability, project.MemberActionRead, project.MemberSubject{}))
}
