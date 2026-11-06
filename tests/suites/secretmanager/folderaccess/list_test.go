package folderaccess_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolderAccess_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should split users by access, flag admins and annotate only the granted user", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		noAccess := proj.NewUser(t, fixture.WithPrincipalName("noaccess"), fixture.WithRoles("no-access"))
		groupOnly := tn.NewUser(t, harness.WithName("grouponly"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, groupOnly, member)
		proj.GrantGroup(t, group, "member")
		before := listUsersAs(t, tn.Admin, proj, at("/app"), "")

		// Action
		secretmanager.GrantFolderAccess(t, proj, noAccess, at("/app"), secretmanager.FolderRead)
		after := listUsersAs(t, tn.Admin, proj, at("/app"), "")

		// Assert
		require.Equalf(t, http.StatusOK, before.status, "listing: %s", before.body)
		require.Equal(t, 4, before.total, "admin, member, no-access user and group-only user, each once")
		require.True(t, before.with[tn.Admin.ID.String()].IsProjectAdmin)
		require.NotContains(t, before.without, tn.Admin.ID.String())
		require.Equal(t, holder{ID: member.ID.String(), Roles: []string{"member"}}, before.with[member.ID.String()])
		require.Equal(t, holder{ID: groupOnly.ID.String(), Roles: []string{"member"}}, before.with[groupOnly.ID.String()])
		require.Equal(t, holder{ID: noAccess.ID.String(), Roles: []string{"no-access"}}, before.without[noAccess.ID.String()])

		require.Equal(t, before.total, after.total)
		require.NotContains(t, after.without, noAccess.ID.String())
		granted := after.with[noAccess.ID.String()]
		require.Empty(t, granted.Roles)
		require.NotNil(t, granted.Grant)
		require.Equal(t, "read", granted.Grant.Permission)
		require.Nil(t, after.with[member.ID.String()].Grant)
	})

	t.Run("should page users with a stable total and filter them by search", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		proj.NewUser(t, fixture.WithPrincipalName("other"))
		one := 1

		// Action
		seen := map[string]int{}
		var totals []int
		for offset := range 3 {
			got := listAccess(t, tn.Admin, proj, harness.User, at("/app"), page{offset: &offset, limit: &one})
			require.Equalf(t, http.StatusOK, got.status, "listing offset %d: %s", offset, got.body)
			require.Equal(t, 1, len(got.with)+len(got.without))
			for id := range got.with {
				seen[id]++
			}
			for id := range got.without {
				seen[id]++
			}
			totals = append(totals, got.total)
		}
		pastTheEnd := 13
		past := listAccess(t, tn.Admin, proj, harness.User, at("/app"), page{offset: &pastTheEnd, limit: &one})
		matching := listUsersAs(t, tn.Admin, proj, at("/app"), member.Email)
		nonMatching := listUsersAs(t, tn.Admin, proj, at("/app"), "zzz-no-such-member")

		// Assert
		require.Equal(t, []int{3, 3, 3}, totals)
		require.Len(t, seen, 3, "every user exactly once across the pages")
		require.Empty(t, past.with)
		require.Empty(t, past.without)
		require.Equal(t, 3, past.total)
		require.Contains(t, matching.with, member.ID.String())
		require.Len(t, matching.with, 1)
		require.Empty(t, nonMatching.with)
		require.Equal(t, 0, nonMatching.total)
	})

	t.Run("should list identities once, flag admins and annotate only the granted one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		admin := proj.NewMachineIdentity(t, fixture.WithRoles("admin"))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		noAccess := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		groupOnly := tn.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)
		addIdentityToGroup(t, tn, group, groupOnly)
		addIdentityToGroup(t, tn, group, member)
		proj.GrantGroup(t, group, "member")
		secretmanager.GrantFolderAccess(t, proj, member, at("/app"), secretmanager.FolderEdit)

		// Action
		got := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{})

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing: %s", got.body)
		require.Equal(t, 4, got.total)
		require.True(t, got.with[admin.ID.String()].IsProjectAdmin)
		require.NotContains(t, got.without, admin.ID.String())
		require.NotNil(t, got.with[member.ID.String()].Grant)
		require.Equal(t, "edit", got.with[member.ID.String()].Grant.Permission)
		require.Equal(t, holder{ID: groupOnly.ID.String(), Roles: []string{"member"}}, got.with[groupOnly.ID.String()])
		require.Equal(t, holder{ID: noAccess.ID.String(), Roles: []string{"no-access"}}, got.without[noAccess.ID.String()])
	})

	t.Run("should clear the annotation when the grant is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.GrantFolderAccess(t, proj, member, at("/app"), secretmanager.FolderManage)
		before := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{})

		// Action
		revoked := revokeGrant(t, tn.Admin, proj, member, at("/app"))
		after := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{})

		// Assert
		require.Equalf(t, http.StatusOK, revoked.status, "revoking: %s", revoked.body)
		require.NotNil(t, before.with[member.ID.String()].Grant)
		require.Equal(t, "manage", before.with[member.ID.String()].Grant.Permission)
		require.Contains(t, after.with, member.ID.String())
		require.Nil(t, after.with[member.ID.String()].Grant)
		require.Equal(t, before.total, after.total)
	})

	t.Run("should list, grant and find by search a user whose only project access is a group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		groupOnly := tn.NewUser(t, harness.WithName("grouponly"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, groupOnly)
		proj.GrantGroup(t, group, "member")

		// Action
		granted := grantAs(t, tn.Admin, proj, groupOnly, at("/app"), secretmanager.FolderRead, nil)
		listed := listUsersAs(t, tn.Admin, proj, at("/app"), "")
		found := listUsersAs(t, tn.Admin, proj, at("/app"), "grouponly")

		// Assert
		require.Equalf(t, http.StatusOK, granted.status, "granting: %s", granted.body)
		require.NotNil(t, listed.with[groupOnly.ID.String()].Grant)
		require.Equal(t, "read", listed.with[groupOnly.ID.String()].Grant.Permission)
		require.Contains(t, found.with, groupOnly.ID.String())
		require.Len(t, found.with, 1)
	})

	t.Run("should page and search identities with a stable total", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		named := proj.NewMachineIdentity(t, fixture.WithPrincipalName("findme-"+uuid.NewString()[:8]), fixture.WithRoles("member"))
		proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		one, pastTheEnd := 1, 12

		// Action
		all := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{})
		past := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{offset: &pastTheEnd, limit: &one})
		found := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{search: &named.Name})
		missing := "zzz-no-such-identity"
		none := listAccess(t, tn.Admin, proj, harness.MachineIdentity, at("/app"), page{search: &missing})

		// Assert
		require.Equalf(t, http.StatusOK, all.status, "listing: %s", all.body)
		require.Equal(t, 2, all.total)
		require.Empty(t, past.with)
		require.Equal(t, all.total, past.total)
		require.Contains(t, found.with, named.ID.String())
		require.Len(t, found.with, 1)
		require.Empty(t, none.with)
		require.Equal(t, 0, none.total)
	})

	t.Run("should refuse an access list for an unknown path, an unknown environment or an out-of-range limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		tooMany := 500

		// Action
		unknownPath := listUsersAs(t, tn.Admin, proj, at("/missing"), "")
		unknownEnv := listUsersAs(t, tn.Admin, proj, secretmanager.Location{Env: "qa", Path: "/app"}, "")
		outOfRange := listAccess(t, tn.Admin, proj, harness.User, at("/app"), page{limit: &tooMany})

		// Assert
		require.Equalf(t, http.StatusNotFound, unknownPath.status, "listing an unknown path: %s", unknownPath.body)
		require.Equalf(t, http.StatusNotFound, unknownEnv.status, "listing an unknown environment: %s", unknownEnv.body)
		require.Equalf(t, http.StatusUnprocessableEntity, outOfRange.status, "listing 500 at once: %s", outOfRange.body)
	})

	t.Run("should include a member's folder grants in their permission audit unless asked to leave them out", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		granted := grantAs(t, tn.Admin, proj, member, at("/app"), secretmanager.FolderRead, nil)
		require.Equalf(t, http.StatusOK, granted.status, "granting: %s", granted.body)
		membershipID := membershipIDOf(t, proj, member)

		// Action
		withFolders := auditSources(t, proj, membershipID, nil)
		withoutFolders := auditSources(t, proj, membershipID, map[string]string{"includeFolderPermissions": "false"})

		// Assert
		require.Contains(t, withFolders, granted.grant.ID)
		require.NotContains(t, withoutFolders, granted.grant.ID)
		require.NotEmpty(t, withoutFolders, "the member's role is still a source")
	})

}

func membershipIDOf(t *testing.T, proj *fixture.Project, user *harness.Principal) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetProjectMembershipByUserIdWithResponse(t.Context(), uuid.MustParse(proj.ID), user.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading %s's membership returned %d: %s", user.Name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Membership.Id.String()
}

// auditSources is the IDs of every source the permission audit names for a membership.
func auditSources(t *testing.T, proj *fixture.Project, membershipID string, query map[string]string) []string {
	t.Helper()
	withQuery := func(_ context.Context, req *http.Request) error {
		q := req.URL.Query()
		for k, v := range query {
			q.Set(k, v)
		}
		req.URL.RawQuery = q.Encode()
		return nil
	}
	res, err := proj.Tenant().Admin.API.GetProjectMembershipPermissionAuditWithResponse(t.Context(), proj.ID, membershipID,
		&api.GetProjectMembershipPermissionAuditParams{}, withQuery)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the permission audit returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, source := range res.JSON200.Sources {
		ids = append(ids, source.Id)
	}
	return ids
}
