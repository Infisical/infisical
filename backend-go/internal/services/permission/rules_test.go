package permission

import (
	"encoding/json"
	"testing"

	"github.com/infisical/gocasl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/permission/project"
)

// ---- buildProjectPermissionRules ----

func TestBuildProjectPermissionRules_BuiltinRoles(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		role         string
		minRuleCount int // at least this many rules
	}{
		{"admin", project.RoleAdmin, len(project.AdminPermissions)},
		{"member", project.RoleMember, len(project.MemberPermissions)},
		{"viewer", project.RoleViewer, len(project.ViewerPermissions)},
		{"no-access", project.RoleNoAccess, 0},
		{"ssh-host-bootstrapper", project.RoleSshHostBootstrapper, len(project.SshHostBootstrapPermissions)},
		{"cryptographic-operator", project.RoleKmsCryptographicOperator, len(project.CryptographicOperatorPermissions)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			roles := []roleWithPermissions{{Role: tt.role}}
			rules := buildProjectPermissionRules(roles)
			assert.Len(t, rules, tt.minRuleCount)
		})
	}
}

func TestBuildProjectPermissionRules_CustomRole(t *testing.T) {
	t.Parallel()

	// PackedRule format: [actions, subject, conditions, inverted]
	packed := []gocasl.PackedRule{
		{
			gocasl.StringOrSlice{"read"},
			gocasl.StringOrSlice{project.SubSecrets},
			gocasl.Cond{"environment": "prod"},
			false,
		},
	}
	packedJSON, err := json.Marshal(packed)
	require.NoError(t, err)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)

	require.Len(t, rules, 1)
	assert.Equal(t, gocasl.StringOrSlice{"read"}, rules[0].Action)
	assert.Equal(t, gocasl.StringOrSlice{project.SubSecrets}, rules[0].Subject)
	assert.Equal(t, "prod", rules[0].Conditions["environment"])
}

func TestBuildProjectPermissionRules_CustomRoleNilPermissions(t *testing.T) {
	t.Parallel()

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: nil}}
	rules := buildProjectPermissionRules(roles)
	assert.Empty(t, rules, "nil permissions must produce no rules")
}

func TestBuildProjectPermissionRules_CustomRoleInvalidJSON(t *testing.T) {
	t.Parallel()

	badJSON := "not valid json"
	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &badJSON}}
	rules := buildProjectPermissionRules(roles)
	assert.Empty(t, rules, "invalid JSON must be silently skipped, producing no rules")
}

func TestBuildProjectPermissionRules_UnknownRoleProducesNothing(t *testing.T) {
	t.Parallel()

	roles := []roleWithPermissions{{Role: "unknown-role-slug"}}
	rules := buildProjectPermissionRules(roles)
	assert.Empty(t, rules)
}

func TestBuildProjectPermissionRules_InvertedRulesPreserved(t *testing.T) {
	t.Parallel()

	// Create a custom role with an inverted (forbid) rule + a non-inverted rule.
	// gocasl auto-prioritizes forbid rules at evaluation time.
	packed := []gocasl.PackedRule{
		// inverted rule (deny read secrets)
		{gocasl.StringOrSlice{"read"}, gocasl.StringOrSlice{project.SubSecrets}, nil, true},
		// allow rule
		{gocasl.StringOrSlice{"create"}, gocasl.StringOrSlice{project.SubSecrets}, nil, false},
	}
	packedJSON, err := json.Marshal(packed)
	require.NoError(t, err)
	packedStr := string(packedJSON)

	roles := []roleWithPermissions{{Role: project.RoleCustom, Permissions: &packedStr}}
	rules := buildProjectPermissionRules(roles)

	require.Len(t, rules, 2)

	hasAllow := false
	hasForbid := false
	for _, r := range rules {
		if r.Inverted {
			hasForbid = true
		} else {
			hasAllow = true
		}
	}
	assert.True(t, hasAllow, "must have allow rule")
	assert.True(t, hasForbid, "must have forbid rule")
}

func TestBuildProjectPermissionRules_MultipleRolesMerge(t *testing.T) {
	t.Parallel()

	roles := []roleWithPermissions{
		{Role: project.RoleViewer},
		{Role: project.RoleSshHostBootstrapper},
	}
	rules := buildProjectPermissionRules(roles)

	expectedLen := len(project.ViewerPermissions) + len(project.SshHostBootstrapPermissions)
	assert.Len(t, rules, expectedLen, "rules from multiple roles must be merged")
}

// ---- buildServiceTokenProjectPermission ----

func TestBuildServiceTokenProjectPermission_ReadOnly(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/app/**"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read"})

	require.Len(t, rules, 1, "read-only should produce 1 rule")
	assert.Equal(t, gocasl.StringOrSlice{"read"}, rules[0].Action)
	assert.Equal(t, gocasl.Op{"$glob": "/app/**"}, rules[0].Conditions["secretPath"])
	assert.Equal(t, "prod", rules[0].Conditions["environment"])
}

func TestBuildServiceTokenProjectPermission_WriteOnly(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "staging", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"write"})

	require.Len(t, rules, 1, "write-only should produce 1 rule")
	assert.Equal(t, gocasl.StringOrSlice{"edit", "create", "delete"}, rules[0].Action)
}

func TestBuildServiceTokenProjectPermission_ReadWrite(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read", "write"})

	require.Len(t, rules, 2, "read+write should produce 2 rules")
}

func TestBuildServiceTokenProjectPermission_MultipleScopes(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/app/**"},
		{Environment: "staging", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read"})

	require.Len(t, rules, 2, "should produce 1 rule per scope")
	assert.Equal(t, "prod", rules[0].Conditions["environment"])
	assert.Equal(t, "staging", rules[1].Conditions["environment"])
}

func TestBuildServiceTokenProjectPermission_NoPermissions(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{})
	assert.Empty(t, rules, "no permissions should produce no rules")
}

func TestBuildServiceTokenProjectPermission_SubjectsIncludeAll(t *testing.T) {
	t.Parallel()

	scopes := []ServiceTokenScope{
		{Environment: "prod", SecretPath: "/"},
	}
	rules := buildServiceTokenProjectPermission(scopes, []string{"read"})

	require.Len(t, rules, 1)
	assert.Contains(t, []string(rules[0].Subject), project.SubSecrets)
	assert.Contains(t, []string(rules[0].Subject), project.SubSecretImports)
	assert.Contains(t, []string(rules[0].Subject), project.SubSecretFolders)
}
