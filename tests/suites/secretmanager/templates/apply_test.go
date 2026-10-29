package templates_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestProjectTemplate_Apply(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create the template's environments in place of the defaults", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{
			"environments": []map[string]any{env("Alpha", "alpha", 1), env("Beta", "beta", 2)},
		}))

		// Action
		proj := newProjectFrom(t, tn.Admin, tpl.Name)

		// Assert
		require.ElementsMatch(t, []string{"alpha", "beta"}, proj.Environments)
	})

	t.Run("should create the template's roles as project roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{"roles": []role{readSecretsRole("reader")}}))

		// Action
		proj := newProjectFrom(t, tn.Admin, tpl.Name)

		// Assert
		res, err := tn.Admin.API.ListProjectRolesWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing roles returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var roleSlugs []string
		for _, r := range res.JSON200.Roles {
			roleSlugs = append(roleSlugs, r.Slug)
		}
		require.Contains(t, roleSlugs, "reader")
	})

	t.Run("should add the template's users, groups and identities with their roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		identity := tn.NewMachineIdentity(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{
			"roles":      []role{readSecretsRole("reader")},
			"users":      []map[string]any{{"username": user.Email, "roles": []string{"viewer"}}},
			"groups":     []map[string]any{{"groupSlug": group.Slug, "roles": []string{"reader"}}},
			"identities": []map[string]any{{"identityId": identity.ID.String(), "roles": []string{"member"}}},
		}))

		// Action
		proj := newProjectFrom(t, tn.Admin, tpl.Name)

		// Assert
		require.Equal(t, []string{"viewer"}, userRoles(t, tn, proj.ID, user))

		groups, err := tn.Admin.API.ListProjectGroupMembershipsWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNilf(t, groups.JSON200, "listing groups returned %d: %s", groups.StatusCode(), apierr.Body(groups.Body))
		require.Len(t, groups.JSON200.GroupMemberships, 1)
		require.Equal(t, group.ID, groups.JSON200.GroupMemberships[0].Group.Id)
		require.Len(t, groups.JSON200.GroupMemberships[0].Roles, 1)
		gr := groups.JSON200.GroupMemberships[0].Roles[0]
		require.Equal(t, "reader", roleSlug(gr.Role, gr.CustomRoleSlug))

		identities, err := tn.Admin.API.ListProjectIdentityMembershipsWithResponse(t.Context(), proj.ID, nil)
		require.NoError(t, err)
		require.NotNilf(t, identities.JSON200, "listing identities returned %d: %s", identities.StatusCode(), apierr.Body(identities.Body))
		require.Len(t, identities.JSON200.IdentityMemberships, 1)
		require.Equal(t, identity.ID.String(), identities.JSON200.IdentityMemberships[0].IdentityId)
		require.Len(t, identities.JSON200.IdentityMemberships[0].Roles, 1)
		require.Equal(t, "member", identities.JSON200.IdentityMemberships[0].Roles[0].Role)
	})

	t.Run("should keep the creator an admin when the template lists them with another role and no admin entry", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{
			"users": []map[string]any{{"username": tn.Admin.Email, "roles": []string{"viewer"}}},
		}))

		// Action
		proj := newProjectFrom(t, tn.Admin, tpl.Name)

		// Assert
		require.Equal(t, []string{"admin"}, userRoles(t, tn, proj.ID, tn.Admin))
	})

	t.Run("should add the creator with the template's roles when the template makes them admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tpl := newTemplate(t, tn, templateBody(map[string]any{
			"roles": []role{readSecretsRole("reader")},
			"users": []map[string]any{{"username": tn.Admin.Email, "roles": []string{"admin", "reader"}}},
		}))

		// Action
		proj := newProjectFrom(t, tn.Admin, tpl.Name)

		// Assert
		require.ElementsMatch(t, []string{"admin", "reader"}, userRoles(t, tn, proj.ID, tn.Admin))
	})
}
