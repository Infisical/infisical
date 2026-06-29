//go:build integration

package secrets_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/server/api/secrets/secret"
	"github.com/infisical/api/tests/infra"
	"github.com/infisical/api/tests/infra/nodejs"
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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-identity-role").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "ROLE_SECRET", "role-value").Do()

			identity := api.Identities.Create("list-perm-identity-role-id")
			if tc.addToProject {
				api.Identities.AddToProject(proj.ID, identity.ID).Role(tc.role).Do()
			}

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-user-role").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "USER_SECRET", "user-value").Do()

			user := api.Users.InviteAndCreate("list-perm-user-" + tc.role + "@test.local")
			api.Users.AddToProject(proj.ID, user.Email).Role(tc.role).Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.UserIdentity(user.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-perm-env-scoped").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_SECRET", "dev-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()

	customRole := api.Roles.CreateCustom(proj.ID, "dev-only-reader", "Dev Only Reader", nodejs.Permission{
		Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"environment": "dev"},
	})

	identity := api.Identities.Create("list-perm-env-scoped-id")
	api.Identities.AddToProject(proj.ID, identity.ID).Role(customRole.Slug).Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-perm-path-scoped").Do()

	api.Folders.Create(proj.ID, proj.EnvSlug, "/", "app")
	api.Folders.Create(proj.ID, proj.EnvSlug, "/app", "config")
	api.Folders.Create(proj.ID, proj.EnvSlug, "/", "other")

	api.Secrets.Create(proj.ID, proj.EnvSlug, "APP_SECRET", "app-value").Path("/app").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "CONFIG_SECRET", "config-value").Path("/app/config").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "OTHER_SECRET", "other-value").Path("/other").Do()

	customRole := api.Roles.CreateCustom(proj.ID, "app-reader", "App Path Reader", nodejs.Permission{
		Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"secretPath": map[string]any{"$glob": "/app/**"}},
	})

	identity := api.Identities.Create("list-perm-path-scoped-id")
	api.Identities.AddToProject(proj.ID, identity.ID).Role(customRole.Slug).Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-group-role").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "GROUP_SECRET", "group-value").Do()

			group := api.Groups.Create("list-perm-group-" + tc.role)
			user := api.Users.InviteAndCreate("list-perm-group-" + tc.role + "@test.local")
			api.Groups.AddUser(group.ID, user.Email)
			api.Groups.AddToProject(proj.ID, group.ID, tc.role)

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.UserIdentity(user.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-perm-group-custom").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_SECRET", "dev-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()

	customRole := api.Roles.CreateCustom(proj.ID, "group-dev-reader", "Group Dev Reader", nodejs.Permission{
		Subject: "secrets", Action: []string{"read"}, Conditions: map[string]any{"environment": "dev"},
	})

	group := api.Groups.Create("list-perm-custom-role-group")
	user := api.Users.InviteAndCreate("list-perm-group-custom@test.local")
	api.Groups.AddUser(group.ID, user.Email)
	api.Groups.AddToProject(proj.ID, group.ID, customRole.Slug)

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.UserIdentity(user.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-perm-addl-priv").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_SECRET", "dev-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()

	identity := api.Identities.Create("list-perm-addl-priv-id")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("no-access").Do()
	api.Identities.AdditionalPrivilege(identity.ID, proj.ID, nodejs.Permission{
		Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "dev"},
	}).Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-perm-multi-addl-priv").Do()
	api.Secrets.Create(proj.ID, "dev", "DEV_SECRET", "dev-value").Do()
	api.Secrets.Create(proj.ID, "staging", "STAGING_SECRET", "staging-value").Do()

	identity := api.Identities.Create("list-perm-multi-addl-priv-id")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("no-access").Do()
	api.Identities.AdditionalPrivilege(identity.ID, proj.ID, nodejs.Permission{
		Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "dev"},
	}).Do()
	api.Identities.AdditionalPrivilege(identity.ID, proj.ID, nodejs.Permission{
		Subject: "secrets", Action: "read", Conditions: map[string]any{"environment": "staging"},
	}).Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-temp-role").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "TEMP_SECRET", "temp-value").Do()

			identity := api.Identities.Create("list-perm-temp-role-id")
			api.Identities.AddToProject(proj.ID, identity.ID).Roles(
				nodejs.RoleAssignment{Role: tc.baseRole, IsTemporary: false},
				nodejs.RoleAssignment{
					Role:                     "admin",
					IsTemporary:              true,
					TemporaryMode:            "relative",
					TemporaryRange:           "1h",
					TemporaryAccessStartTime: time.Now().Add(tc.startOffset).UTC().Format(time.RFC3339),
				},
			).Do()

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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-temp-addl").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "TEMP_ADDL_SECRET", "temp-addl-value").Do()

			identity := api.Identities.Create("list-perm-temp-addl-id")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("no-access").Do()
			api.Identities.AdditionalPrivilege(identity.ID, proj.ID, nodejs.Permission{
				Subject: "secrets", Action: "read",
			}).Temporary("1h", time.Now().Add(tc.startOffset).UTC().Format(time.RFC3339)).Do()

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
			nj := stack.NodeJS()
			api := nj.For(t)

			proj := api.Projects.Create("list-perm-view-value").Do()
			api.Secrets.Create(proj.ID, proj.EnvSlug, "VALUE_SECRET", "real-value").Do()

			identity := api.Identities.Create("list-perm-view-value-id")
			api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

			client := infra.NewClientBuilder(t, newSecretsRouter(t)).
				Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
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
