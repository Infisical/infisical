//go:build integration

package secrets_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
)

// TestListSecrets_Permission_IdentityRole covers base project roles assigned to
// a machine identity, plus the not-a-member case.
func TestListSecrets_Permission_IdentityRole(t *testing.T) {
	tests := []struct {
		name         string
		role         string
		addToProject bool
		wantErr      string
		wantSecret   bool
	}{
		{name: "admin can read", role: "admin", addToProject: true, wantSecret: true},
		{name: "member can read", role: "member", addToProject: true, wantSecret: true},
		{name: "viewer can read", role: "viewer", addToProject: true, wantSecret: true},
		{name: "no-access sees nothing", role: "no-access", addToProject: true, wantSecret: false},
		{name: "non-member is forbidden", addToProject: false, wantErr: "not a member"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-identity-role")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "ROLE_SECRET", "role-value", nil)

			identity := nodejs.CreateIdentity(t, "list-perm-identity-role-id")
			if tc.addToProject {
				nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(tc.role))
			}

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			})

			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				return
			}

			require.NoError(t, err)
			if tc.wantSecret {
				require.Len(t, resp.Secrets, 1)
				assert.False(t, resp.Secrets[0].SecretValueHidden)
				assert.Equal(t, "role-value", resp.Secrets[0].SecretValue)
			} else {
				assert.Empty(t, resp.Secrets)
			}
		})
	}
}

// TestListSecrets_Permission_UserRole covers base project roles assigned to a
// user via direct membership.
func TestListSecrets_Permission_UserRole(t *testing.T) {
	tests := []struct {
		name string
		role string
	}{
		{name: "admin can read", role: "admin"},
		{name: "viewer can read", role: "viewer"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-user-role")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "USER_SECRET", "user-value", nil)

			user := nodejs.InviteAndCreateUser(t, "list-perm-user-"+tc.role+"@test.local")
			nodejs.AddUserToProject(t, proj.ID, user.Email, []string{tc.role})

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.UserIdentity(user.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			})

			require.NoError(t, err)
			require.Len(t, resp.Secrets, 1)
			assert.False(t, resp.Secrets[0].SecretValueHidden)
			assert.Equal(t, "user-value", resp.Secrets[0].SecretValue)
		})
	}
}

func TestListSecrets_Permission_CustomRoleEnvironmentScoped(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-perm-env-scoped")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "dev-only-reader", "Dev Only Reader", []infra.Permission{
		{Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"environment": "dev"}},
	})

	identity := nodejs.CreateIdentity(t, "list-perm-env-scoped-id")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	dev, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "dev", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, dev.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", dev.Secrets[0].SecretKey)

	staging, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "staging", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	assert.Empty(t, staging.Secrets, "should not see staging secrets with dev-only role")
}

func TestListSecrets_Permission_CustomRolePathScoped(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-perm-path-scoped")

	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "app")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/app", "config")
	nodejs.CreateFolder(t, proj.ID, proj.EnvSlug, "/", "other")

	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/app", "APP_SECRET", "app-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/app/config", "CONFIG_SECRET", "config-value", nil)
	nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/other", "OTHER_SECRET", "other-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "app-reader", "App Path Reader", []infra.Permission{
		{Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"secretPath": map[string]any{"$glob": "/app/**"}}},
	})

	identity := nodejs.CreateIdentity(t, "list-perm-path-scoped-id")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role(customRole.Slug))

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	app, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/app"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, app.Secrets, 1)
	assert.Equal(t, "APP_SECRET", app.Secrets[0].SecretKey)

	config, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/app/config"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, config.Secrets, 1)
	assert.Equal(t, "CONFIG_SECRET", config.Secrets[0].SecretKey)

	other, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: proj.EnvSlug, SecretPath: new("/other"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	assert.Empty(t, other.Secrets, "should not see /other secrets with /app/** role")
}

// TestListSecrets_Permission_GroupRole covers a user inheriting a base project
// role through group membership.
func TestListSecrets_Permission_GroupRole(t *testing.T) {
	tests := []struct {
		name string
		role string
	}{
		{name: "admin inherited via group", role: "admin"},
		{name: "viewer inherited via group", role: "viewer"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-group-role")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "GROUP_SECRET", "group-value", nil)

			group := nodejs.CreateGroup(t, "list-perm-group-"+tc.role)
			user := nodejs.InviteAndCreateUser(t, "list-perm-group-"+tc.role+"@test.local")
			nodejs.AddUserToGroup(t, group.ID, user.Email)
			nodejs.AddGroupToProject(t, proj.ID, group.ID, tc.role)

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.UserIdentity(user.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			})

			require.NoError(t, err)
			require.Len(t, resp.Secrets, 1)
			assert.False(t, resp.Secrets[0].SecretValueHidden)
			assert.Equal(t, "group-value", resp.Secrets[0].SecretValue)
		})
	}
}

func TestListSecrets_Permission_GroupCustomRole(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-perm-group-custom")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	customRole := nodejs.CreateCustomProjectRole(t, proj.ID, "group-dev-reader", "Group Dev Reader", []infra.Permission{
		{Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"environment": "dev"}},
	})

	group := nodejs.CreateGroup(t, "list-perm-custom-role-group")
	user := nodejs.InviteAndCreateUser(t, "list-perm-group-custom@test.local")
	nodejs.AddUserToGroup(t, group.ID, user.Email)
	nodejs.AddGroupToProject(t, proj.ID, group.ID, customRole.Slug)

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.UserIdentity(user.ID, nodejs.OrgID())).
		Build()

	dev, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "dev", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, dev.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", dev.Secrets[0].SecretKey)

	staging, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "staging", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	assert.Empty(t, staging.Secrets)
}

func TestListSecrets_Permission_AdditionalPrivilegeExtendsRole(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-perm-addl-priv")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	identity := nodejs.CreateIdentity(t, "list-perm-addl-priv-id")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "dev"}},
	}, nil)

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	dev, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "dev", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, dev.Secrets, 1)
	assert.Equal(t, "DEV_SECRET", dev.Secrets[0].SecretKey)

	staging, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "staging", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	assert.Empty(t, staging.Secrets)
}

func TestListSecrets_Permission_MultipleAdditionalPrivilegesMerge(t *testing.T) {
	t.Parallel()
	nodejs := stack.NodeJS()

	proj := nodejs.CreateProject(t, "list-perm-multi-addl-priv")
	nodejs.CreateSecret(t, proj.ID, "dev", "/", "DEV_SECRET", "dev-value", nil)
	nodejs.CreateSecret(t, proj.ID, "staging", "/", "STAGING_SECRET", "staging-value", nil)

	identity := nodejs.CreateIdentity(t, "list-perm-multi-addl-priv-id")
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "dev"}},
	}, nil)
	nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
		{Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "staging"}},
	}, nil)

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
		Build()

	dev, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "dev", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, dev.Secrets, 1)

	staging, err := listSecrets(client, &secret.ListSecretsV4Query{
		ProjectID: proj.ID, Environment: "staging", SecretPath: new("/"), ViewSecretValue: new(true),
	})
	require.NoError(t, err)
	require.Len(t, staging.Secrets, 1)
}

// TestListSecrets_Permission_TemporaryRole covers temporary project role grants:
// an active grant allows access, an expired one falls back to the permanent role.
func TestListSecrets_Permission_TemporaryRole(t *testing.T) {
	tests := []struct {
		name        string
		startOffset time.Duration
		baseRole    string
		wantSecret  bool
	}{
		{name: "active grants access", startOffset: 0, baseRole: "no-access", wantSecret: true},
		{name: "expired denies access", startOffset: -2 * time.Hour, baseRole: "no-access", wantSecret: false},
		{name: "expired falls back to permanent viewer", startOffset: -2 * time.Hour, baseRole: "viewer", wantSecret: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-temp-role")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TEMP_SECRET", "temp-value", nil)

			identity := nodejs.CreateIdentity(t, "list-perm-temp-role-id")
			nodejs.AddIdentityToProject(t, proj.ID, identity.ID, []infra.RoleAssignment{
				{Role: tc.baseRole, IsTemporary: false},
				{
					Role:                     "admin",
					IsTemporary:              true,
					TemporaryMode:            "relative",
					TemporaryRange:           "1h",
					TemporaryAccessStartTime: time.Now().Add(tc.startOffset).UTC().Format(time.RFC3339),
				},
			})

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			})
			require.NoError(t, err)

			if tc.wantSecret {
				require.Len(t, resp.Secrets, 1)
				assert.Equal(t, "temp-value", resp.Secrets[0].SecretValue)
			} else {
				assert.Empty(t, resp.Secrets, "expired temporary role should not grant access")
			}
		})
	}
}

// TestListSecrets_Permission_TemporaryAdditionalPrivilege covers temporary
// additional privileges: active grants access, expired does not.
func TestListSecrets_Permission_TemporaryAdditionalPrivilege(t *testing.T) {
	tests := []struct {
		name        string
		startOffset time.Duration
		wantSecret  bool
	}{
		{name: "active grants access", startOffset: 0, wantSecret: true},
		{name: "expired denies access", startOffset: -2 * time.Hour, wantSecret: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-temp-addl")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "TEMP_ADDL_SECRET", "temp-addl-value", nil)

			identity := nodejs.CreateIdentity(t, "list-perm-temp-addl-id")
			nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("no-access"))
			nodejs.CreateIdentityAdditionalPrivilege(t, identity.ID, proj.ID, []infra.Permission{
				{Subject: "secrets", Action: "read"},
			}, &infra.IdentityPrivilegeOpts{
				TemporaryRange:           "1h",
				TemporaryAccessStartTime: time.Now().Add(tc.startOffset).UTC().Format(time.RFC3339),
			})

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(true),
			})
			require.NoError(t, err)

			if tc.wantSecret {
				require.Len(t, resp.Secrets, 1)
				assert.Equal(t, "temp-addl-value", resp.Secrets[0].SecretValue)
			} else {
				assert.Empty(t, resp.Secrets, "expired temporary additional privilege should not grant access")
			}
		})
	}
}

// TestListSecrets_Permission_ViewSecretValue verifies that viewSecretValue masks
// or reveals the value.
func TestListSecrets_Permission_ViewSecretValue(t *testing.T) {
	tests := []struct {
		name       string
		view       bool
		wantHidden bool
		wantValue  string
	}{
		{name: "false masks the value", view: false, wantHidden: true, wantValue: "<hidden-by-infisical>"},
		{name: "true reveals the value", view: true, wantHidden: false, wantValue: "real-value"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			nodejs := stack.NodeJS()

			proj := nodejs.CreateProject(t, "list-perm-view-value")
			nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "VALUE_SECRET", "real-value", nil)

			identity := nodejs.CreateIdentity(t, "list-perm-view-value-id")
			nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
				Build()

			resp, err := listSecrets(client, &secret.ListSecretsV4Query{
				ProjectID:       proj.ID,
				Environment:     proj.EnvSlug,
				SecretPath:      new("/"),
				ViewSecretValue: new(tc.view),
			})
			require.NoError(t, err)
			require.Len(t, resp.Secrets, 1)
			assert.Equal(t, tc.wantHidden, resp.Secrets[0].SecretValueHidden)
			assert.Equal(t, tc.wantValue, resp.Secrets[0].SecretValue)
		})
	}
}
