package permission

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/permission/project"
)

// ---- helpers ----

// loadAbilityFromRules marshals JSONRules to JSON and loads via gocasl.LoadFromJSON
// with the custom $glob operator. This simulates the real permission evaluation path.
func loadAbilityFromRules(t *testing.T, rules []gocasl.JSONRule, vars map[string]any) *gocasl.Ability {
	t.Helper()

	rulesJSON, err := json.Marshal(rules)
	require.NoError(t, err)

	opts := gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
		Vars:     vars,
	}

	ability, err := gocasl.LoadFromJSON(rulesJSON, opts)
	require.NoError(t, err)

	return ability
}

// =====================================================
// Admin role: must have access to everything
// =====================================================

func TestAdminRole_CanCRUDSecrets(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.AdminPermissions, nil)

	sub := project.SecretSubject{Environment: "prod", SecretPath: "/app"}
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, sub))
}

func TestAdminRole_CanCRUDSecretFolders(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.AdminPermissions, nil)

	sub := project.SecretFolderSubject{Environment: "dev", SecretPath: "/"}
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, sub))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionDelete, sub))
}

func TestAdminRole_CanManageMembers(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.AdminPermissions, nil)

	sub := project.MemberSubject{}
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionDelete, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionGrantPrivileges, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionAssignRole, sub))
}

func TestAdminRole_CanManageIdentities(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.AdminPermissions, nil)

	sub := project.IdentitySubject{}
	assert.True(t, gocasl.Can(ability, project.IdentityActionRead, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionDelete, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGrantPrivileges, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionRevokeAuth, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionCreateToken, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionGetToken, sub))
	assert.True(t, gocasl.Can(ability, project.IdentityActionDeleteToken, sub))
}

func TestAdminRole_CanDeleteProject(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.AdminPermissions, nil)

	sub := project.ProjectSubject{}
	assert.True(t, gocasl.Can(ability, project.ProjectActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.ProjectActionDelete, sub))
}

// =====================================================
// Viewer role: read only, must NOT write
// =====================================================

func TestViewerRole_CanReadSecretMetadataAndValue(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.SecretSubject{Environment: "prod", SecretPath: "/"}
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeSecret, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionReadValue, sub))
}

func TestViewerRole_CannotWriteSecrets(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.SecretSubject{Environment: "prod", SecretPath: "/"}
	assert.True(t, gocasl.Cannot(ability, project.SecretActionCreate, sub), "viewer must NOT create secrets")
	assert.True(t, gocasl.Cannot(ability, project.SecretActionEdit, sub), "viewer must NOT edit secrets")
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDelete, sub), "viewer must NOT delete secrets")
}

func TestViewerRole_CannotWriteSecretFolders(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.SecretFolderSubject{Environment: "prod", SecretPath: "/"}
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead, sub))
	assert.True(t, gocasl.Cannot(ability, project.SecretFolderActionCreate, sub), "viewer must NOT create folders")
	assert.True(t, gocasl.Cannot(ability, project.SecretFolderActionEdit, sub), "viewer must NOT edit folders")
	assert.True(t, gocasl.Cannot(ability, project.SecretFolderActionDelete, sub), "viewer must NOT delete folders")
}

func TestViewerRole_CannotManageMembers(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.MemberSubject{}
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, sub))
	assert.True(t, gocasl.Cannot(ability, project.MemberActionCreate, sub), "viewer must NOT create members")
	assert.True(t, gocasl.Cannot(ability, project.MemberActionDelete, sub), "viewer must NOT delete members")
	assert.True(t, gocasl.Cannot(ability, project.MemberActionGrantPrivileges, sub), "viewer must NOT grant privileges")
}

func TestViewerRole_CannotDeleteProject(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.ProjectSubject{}
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionEdit, sub), "viewer must NOT edit project")
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionDelete, sub), "viewer must NOT delete project")
}

func TestViewerRole_CannotWriteDynamicSecrets(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.ViewerPermissions, nil)

	sub := project.DynamicSecretSubject{Environment: "prod", SecretPath: "/"}
	assert.True(t, gocasl.Can(ability, project.DynamicSecretActionReadRootCredential, sub))
	assert.True(t, gocasl.Cannot(ability, project.DynamicSecretActionCreateRootCredential, sub))
	assert.True(t, gocasl.Cannot(ability, project.DynamicSecretActionEditRootCredential, sub))
	assert.True(t, gocasl.Cannot(ability, project.DynamicSecretActionDeleteRootCredential, sub))
}

// =====================================================
// Member role: selective write
// =====================================================

func TestMemberRole_CanCRUDSecrets(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.MemberPermissions, nil)

	sub := project.SecretSubject{Environment: "staging", SecretPath: "/app"}
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, sub))
}

func TestMemberRole_CannotDeleteProject(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.MemberPermissions, nil)

	sub := project.ProjectSubject{}
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionEdit, sub), "member must NOT edit project")
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionDelete, sub), "member must NOT delete project")
}

func TestMemberRole_CannotGrantPrivileges(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.MemberPermissions, nil)

	sub := project.MemberSubject{}
	assert.True(t, gocasl.Can(ability, project.MemberActionRead, sub))
	assert.True(t, gocasl.Can(ability, project.MemberActionCreate, sub))
	assert.True(t, gocasl.Cannot(ability, project.MemberActionGrantPrivileges, sub), "member must NOT grant privileges")
	assert.True(t, gocasl.Cannot(ability, project.MemberActionAssignRole, sub), "member must NOT assign roles")
}

// =====================================================
// NoAccess role: must deny everything
// =====================================================

func TestNoAccessRole_CannotDoAnything(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.NoAccessPermissions, nil)

	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.SecretActionCreate, project.SecretSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.SecretFolderActionRead, project.SecretFolderSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionDelete, project.ProjectSubject{}))
}

// =====================================================
// Specialized roles
// =====================================================

func TestSshHostBootstrapperRole_OnlySshHostActions(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.SshHostBootstrapPermissions, nil)

	sub := project.SshHostSubject{Hostname: "host1.example.com"}
	assert.True(t, gocasl.Can(ability, project.SshHostActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.SshHostActionIssueHostCert, sub))

	// Must not have any other access
	assert.True(t, gocasl.Cannot(ability, project.SshHostActionRead, sub))
	assert.True(t, gocasl.Cannot(ability, project.SshHostActionDelete, sub))
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
}

func TestCryptographicOperatorRole_OnlyCmekCryptoOps(t *testing.T) {
	t.Parallel()
	ability := loadAbilityFromRules(t, project.CryptographicOperatorPermissions, nil)

	sub := project.CmekSubject{}
	assert.True(t, gocasl.Can(ability, project.CmekActionEncrypt, sub))
	assert.True(t, gocasl.Can(ability, project.CmekActionDecrypt, sub))
	assert.True(t, gocasl.Can(ability, project.CmekActionSign, sub))
	assert.True(t, gocasl.Can(ability, project.CmekActionVerify, sub))

	// Must not have CRUD or other access
	assert.True(t, gocasl.Cannot(ability, project.CmekActionRead, sub))
	assert.True(t, gocasl.Cannot(ability, project.CmekActionCreate, sub))
	assert.True(t, gocasl.Cannot(ability, project.CmekActionDelete, sub))
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue, project.SecretSubject{}))
}

// =====================================================
// Custom role: conditional access with environment scoping
// =====================================================

func TestCustomRole_EnvironmentCondition_AllowsProdOnly(t *testing.T) {
	t.Parallel()

	packed := []gocasl.PackedRule{
		{gocasl.StringOrSlice{"read"}, gocasl.StringOrSlice{project.SubSecrets}, gocasl.Cond{"environment": "prod"}, false},
	}
	packedJSON, _ := json.Marshal(packed)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)
	ability := loadAbilityFromRules(t, rules, nil)

	prodSecret := project.SecretSubject{Environment: "prod", SecretPath: "/app"}
	stagingSecret := project.SecretSubject{Environment: "staging", SecretPath: "/app"}

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, prodSecret), "must read prod secrets")
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue, stagingSecret), "must NOT read staging secrets")
}

func TestCustomRole_SecretPathGlobCondition(t *testing.T) {
	t.Parallel()

	packed := []gocasl.PackedRule{
		{
			gocasl.StringOrSlice{"read"},
			gocasl.StringOrSlice{project.SubSecrets},
			gocasl.Cond{
				"environment": "prod",
				"secretPath":  gocasl.Op{"$glob": "/app/**"},
			},
			false,
		},
	}
	packedJSON, _ := json.Marshal(packed)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)
	ability := loadAbilityFromRules(t, rules, nil)

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}),
		"must read secrets under /app/**")

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db/nested"}),
		"must read secrets deeply nested under /app/**")

	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/other"}),
		"must NOT read secrets outside /app/**")

	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "staging", SecretPath: "/app/db"}),
		"must NOT read secrets in wrong environment")
}

func TestCustomRole_InvertedRuleBlocksSpecificAction(t *testing.T) {
	t.Parallel()

	// Allow all CRUD, but forbid delete on prod.
	// NOTE: Currently fails due to gocasl LoadFromJSON not processing the "inverted" field.
	rules := []gocasl.JSONRule{
		{Action: gocasl.StringOrSlice{"read", "create", "edit", "delete"}, Subject: gocasl.StringOrSlice{project.SubSecrets}},
		{Action: gocasl.StringOrSlice{"delete"}, Subject: gocasl.StringOrSlice{project.SubSecrets}, Conditions: gocasl.Cond{"environment": "prod"}, Inverted: true},
	}
	ability := loadAbilityFromRules(t, rules, nil)

	prodSecret := project.SecretSubject{Environment: "prod", SecretPath: "/"}
	stagingSecret := project.SecretSubject{Environment: "staging", SecretPath: "/"}

	// Can read/create/edit everywhere
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, prodSecret))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, prodSecret))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, prodSecret))

	// Delete blocked on prod, allowed on staging
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDelete, prodSecret), "delete must be blocked on prod")
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, stagingSecret), "delete must be allowed on staging")
}

func TestCustomRole_InConditionOnEnvironment(t *testing.T) {
	t.Parallel()

	// Allow read on specific environments via $in
	packed := []gocasl.PackedRule{
		{
			gocasl.StringOrSlice{"read"},
			gocasl.StringOrSlice{project.SubSecrets},
			gocasl.Cond{"environment": gocasl.Op{"$in": []any{"dev", "staging"}}},
			false,
		},
	}
	packedJSON, _ := json.Marshal(packed)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)
	ability := loadAbilityFromRules(t, rules, nil)

	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "dev"}))
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "staging"}))
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod"}),
		"prod must be denied when $in only includes dev and staging")
}

func TestCustomRole_MultipleConditionsOnSecretFields(t *testing.T) {
	t.Parallel()

	// Allow read only on specific environment + secretPath pattern
	packed := []gocasl.PackedRule{
		{
			gocasl.StringOrSlice{"read"},
			gocasl.StringOrSlice{project.SubSecrets},
			gocasl.Cond{
				"environment": "prod",
				"secretPath":  gocasl.Op{"$glob": "/database/**"},
			},
			false,
		},
	}
	packedJSON, _ := json.Marshal(packed)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)
	ability := loadAbilityFromRules(t, rules, nil)

	// Both conditions must match
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/database/mysql"}))

	// Wrong env, right path → denied
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "staging", SecretPath: "/database/mysql"}))

	// Right env, wrong path → denied
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/config"}))
}

// =====================================================
// Service token: scoped access via $glob
// =====================================================

func TestServiceToken_ScopedReadAccess(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/app/**"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read"})
	ability := loadAbilityFromRules(t, rules, nil)

	// Can read secrets under /app/**
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}))

	// Can read secret folders under /app/**
	assert.True(t, gocasl.Can(ability, project.SecretFolderActionRead,
		project.SecretFolderSubject{Environment: "prod", SecretPath: "/app/db"}))

	// Can read secret imports under /app/**
	assert.True(t, gocasl.Can(ability, project.SecretImportActionRead,
		project.SecretImportSubject{Environment: "prod", SecretPath: "/app/db"}))

	// Cannot read in wrong environment
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "staging", SecretPath: "/app/db"}),
		"must NOT read in different environment")

	// Cannot read outside scoped path
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/other"}),
		"must NOT read outside scoped path")

	// Cannot write (read-only token)
	assert.True(t, gocasl.Cannot(ability, project.SecretActionCreate,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}),
		"read-only token must NOT create")
	assert.True(t, gocasl.Cannot(ability, project.SecretActionEdit,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}),
		"read-only token must NOT edit")
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDelete,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}),
		"read-only token must NOT delete")
}

func TestServiceToken_ScopedWriteAccess(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/app/**"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read", "write"})
	ability := loadAbilityFromRules(t, rules, nil)

	sub := project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionCreate, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionEdit, sub))
	assert.True(t, gocasl.Can(ability, project.SecretActionDelete, sub))

	// Still cannot write outside scope
	outsideSub := project.SecretSubject{Environment: "prod", SecretPath: "/other"}
	assert.True(t, gocasl.Cannot(ability, project.SecretActionCreate, outsideSub),
		"must NOT write outside scoped path")
}

func TestServiceToken_MultiScopeIsolation(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/app/**"},
		{Environment: "staging", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read"})
	ability := loadAbilityFromRules(t, rules, nil)

	// Prod: can read /app/**, cannot read /other
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/app/db"}))
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "prod", SecretPath: "/other"}))

	// Staging: can read root / only
	assert.True(t, gocasl.Can(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "staging", SecretPath: "/"}))

	// Dev: no scope → denied
	assert.True(t, gocasl.Cannot(ability, project.SecretActionDescribeAndReadValue,
		project.SecretSubject{Environment: "dev", SecretPath: "/"}),
		"env without scope must be denied")
}

func TestServiceToken_NoAccessToNonSecretSubjects(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/**"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read", "write"})
	ability := loadAbilityFromRules(t, rules, nil)

	// Service tokens should not have member/identity/project access
	assert.True(t, gocasl.Cannot(ability, project.MemberActionRead, project.MemberSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.IdentityActionRead, project.IdentitySubject{}))
	assert.True(t, gocasl.Cannot(ability, project.ProjectActionDelete, project.ProjectSubject{}))
	assert.True(t, gocasl.Cannot(ability, project.CaActionRead, project.CertificateAuthoritySubject{}))
}

// =====================================================
// Template variable interpolation
// =====================================================

func TestTemplateVars_IdentityIdInterpolation(t *testing.T) {
	t.Parallel()

	// Tests the full pipeline: Handlebars templates in rules JSON → InterpolateRulesJSON
	// resolves values → gocasl loads the interpolated JSON with actual values baked in.
	rules := []gocasl.JSONRule{
		{
			Action:  gocasl.StringOrSlice{"read"},
			Subject: gocasl.StringOrSlice{project.SubIdentity},
			Conditions: gocasl.Cond{
				"identityId": "{{identity.id}}",
			},
		},
	}

	rulesJSON, err := json.Marshal(rules)
	require.NoError(t, err)

	actorID := uuid.New().String()
	vars := map[string]any{
		"identity": map[string]any{
			"id": actorID,
		},
	}

	interpolated := InterpolateRulesJSON(string(rulesJSON), vars)
	ability, err := gocasl.LoadFromJSON([]byte(interpolated), gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
	})
	require.NoError(t, err)

	// Can read own identity
	assert.True(t, gocasl.Can(ability, project.IdentityActionRead,
		project.IdentitySubject{IdentityID: actorID}))

	// Cannot read other identity
	assert.True(t, gocasl.Cannot(ability, project.IdentityActionRead,
		project.IdentitySubject{IdentityID: uuid.New().String()}),
		"must NOT read other identity")
}

// =====================================================
// flattenActiveRolesFromMemberships
// =====================================================

func TestFlattenActiveRolesFromMemberships_ActiveRolesIncluded(t *testing.T) {
	t.Parallel()

	perms := new(`[[["read"],["secrets"]]]`)
	data := []PermissionData{
		{
			ID: uuid.New(),
			Roles: []RoleInfo{
				{Role: project.RoleAdmin, IsTemporary: false},
				{Role: project.RoleCustom, IsTemporary: false, Permissions: perms},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	assert.Len(t, result, 2)
	assert.Equal(t, project.RoleAdmin, result[0].Role)
	assert.Equal(t, project.RoleCustom, result[1].Role)
}

func TestFlattenActiveRolesFromMemberships_ExpiredTemporaryRoleExcluded(t *testing.T) {
	t.Parallel()

	pastTime := time.Now().Add(-1 * time.Hour)
	data := []PermissionData{
		{
			ID: uuid.New(),
			Roles: []RoleInfo{
				{Role: project.RoleAdmin, IsTemporary: true, TemporaryAccessEndTime: &pastTime},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	assert.Empty(t, result, "expired temporary role must be excluded")
}

func TestFlattenActiveRolesFromMemberships_ActiveTemporaryRoleIncluded(t *testing.T) {
	t.Parallel()

	futureTime := time.Now().Add(1 * time.Hour)
	data := []PermissionData{
		{
			ID: uuid.New(),
			Roles: []RoleInfo{
				{Role: project.RoleMember, IsTemporary: true, TemporaryAccessEndTime: &futureTime},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	require.Len(t, result, 1)
	assert.Equal(t, project.RoleMember, result[0].Role)
}

func TestFlattenActiveRolesFromMemberships_TemporaryWithNilEndTimeExcluded(t *testing.T) {
	t.Parallel()

	data := []PermissionData{
		{
			ID: uuid.New(),
			Roles: []RoleInfo{
				{Role: project.RoleAdmin, IsTemporary: true, TemporaryAccessEndTime: nil},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	assert.Empty(t, result, "temporary role with nil end time must be excluded (fail-secure)")
}

func TestFlattenActiveRolesFromMemberships_ExpiredAdditionalPrivilegeExcluded(t *testing.T) {
	t.Parallel()

	pastTime := time.Now().Add(-1 * time.Hour)
	perms := new(`[[["read"],["secrets"]]]`)
	data := []PermissionData{
		{
			ID: uuid.New(),
			AdditionalPrivileges: []AdditionalPrivilegeInfo{
				{IsTemporary: true, TemporaryAccessEndTime: &pastTime, Permissions: perms},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	assert.Empty(t, result, "expired additional privilege must be excluded")
}

func TestFlattenActiveRolesFromMemberships_ActiveAdditionalPrivilegeIncluded(t *testing.T) {
	t.Parallel()

	futureTime := time.Now().Add(1 * time.Hour)
	perms := new(`[[["read"],["secrets"]]]`)
	data := []PermissionData{
		{
			ID: uuid.New(),
			AdditionalPrivileges: []AdditionalPrivilegeInfo{
				{IsTemporary: true, TemporaryAccessEndTime: &futureTime, Permissions: perms},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	require.Len(t, result, 1)
	assert.Equal(t, project.RoleCustom, result[0].Role, "additional privileges must use custom role value")
}

func TestFlattenActiveRolesFromMemberships_NonTemporaryAdditionalPrivilegeIncluded(t *testing.T) {
	t.Parallel()

	perms := new(`[[["read"],["secrets"]]]`)
	data := []PermissionData{
		{
			ID: uuid.New(),
			AdditionalPrivileges: []AdditionalPrivilegeInfo{
				{IsTemporary: false, Permissions: perms},
			},
		},
	}

	result := flattenActiveRolesFromMemberships(data)
	require.Len(t, result, 1)
}

// =====================================================
// HasRole
// =====================================================

func TestHasRole_MatchesRoleSlug(t *testing.T) {
	t.Parallel()

	result := &GetProjectPermissionResult{
		Memberships: []Membership{
			{
				ID: uuid.New(),
				Roles: []MembershipRole{
					{Role: project.RoleAdmin},
				},
			},
		},
	}

	assert.True(t, result.HasRole(project.RoleAdmin))
	assert.False(t, result.HasRole(project.RoleMember))
}

func TestHasRole_MatchesCustomRoleSlug(t *testing.T) {
	t.Parallel()

	result := &GetProjectPermissionResult{
		Memberships: []Membership{
			{
				ID: uuid.New(),
				Roles: []MembershipRole{
					{Role: project.RoleCustom, CustomRoleSlug: "devops-lead"},
				},
			},
		},
	}

	assert.True(t, result.HasRole("devops-lead"))
	assert.True(t, result.HasRole(project.RoleCustom))
	assert.False(t, result.HasRole(project.RoleAdmin))
}

func TestHasRole_EmptyMemberships(t *testing.T) {
	t.Parallel()

	result := &GetProjectPermissionResult{
		Memberships: nil,
	}

	assert.False(t, result.HasRole(project.RoleAdmin))
}

// =====================================================
// checkProjectEnforcement
// =====================================================

func TestCheckProjectEnforcement(t *testing.T) {
	t.Parallel()

	fn := checkProjectEnforcement(&ProjectDetail{
		EnforceEncryptedSecretManagerSecretMetadata: true,
	})

	assert.True(t, fn("enforceEncryptedSecretManagerSecretMetadata"))
	assert.False(t, fn("unknownEnforcement"))
	assert.False(t, fn(""))

	fnDisabled := checkProjectEnforcement(&ProjectDetail{
		EnforceEncryptedSecretManagerSecretMetadata: false,
	})
	assert.False(t, fnDisabled("enforceEncryptedSecretManagerSecretMetadata"))
}

// ---- helpers ----
