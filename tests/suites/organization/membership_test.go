package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestMembership_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse editing one's own membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		own := membershipOf(t, tn, tn.Admin)

		// Action
		res, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), own.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{Role: new("member")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot update own organization membership")
		require.Equal(t, "admin", membershipOf(t, tn, tn.Admin).Role)
	})

	t.Run("should refuse assigning admin when the actor cannot grant member privileges, and keep the role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		editor := customRoleUser(t, tn, "member-editor",
			fixture.Permission{Subject: "member", Action: []string{"read", "edit"}})
		target := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := editor.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, tn, target).ID.String(), api.UpdateOrgMembershipJSONRequestBody{Role: new("admin")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Permission denied: grant-privileges on member")
		require.Equal(t, "member", membershipOf(t, tn, target).Role)
	})

	t.Run("should answer 404 for another org's membership id and leave it unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		theirs := other.NewUser(t, harness.OrgRole("member"))
		id := membershipOf(t, other, theirs).ID.String()

		// Action
		res, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), id,
			api.UpdateOrgMembershipJSONRequestBody{Role: new("admin")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "member", membershipOf(t, other, theirs).Role)
	})
}

func TestMembership_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse removing the last admin through the API", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		res, err := identity.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, tn, tn.Admin).ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This action would leave the organization with no admin")
		require.Equal(t, "admin", membershipOf(t, tn, tn.Admin).Role)
	})

	t.Run("should refuse removing oneself", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		second := tn.NewUser(t, harness.OrgRole("admin"))

		// Action
		res, err := second.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, tn, second).ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You cannot remove yourself from an organization")
		require.Equal(t, "admin", membershipOf(t, tn, second).Role)
	})

	t.Run("should remove the member from projects and groups when removed from the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t, harness.OrgRole("member"))
		proj.Grant(t, member, "viewer")
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		require.Contains(t, groupMemberIDs(t, tn, group), member.ID)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, tn, member).ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, fixture.MembershipOf(t, tn, member.Email))
		require.NotContains(t, projectMemberEmails(t, tn, proj), member.Email)
		// The group list only shows org members, so the user is invited back: a group row that
		// survived the removal would list them as a member again.
		reinvited := invite(t, tn, tn.Admin, "member", member.Email)
		requireStatus(t, http.StatusOK, reinvited.StatusCode(), reinvited.Body)
		require.NotNil(t, fixture.MembershipOf(t, tn, member.Email))
		require.NotContains(t, groupMemberIDs(t, tn, group), member.ID)
	})

	t.Run("should answer 404 for another org's membership id and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		theirs := other.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, other, theirs).ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.NotNil(t, fixture.MembershipOf(t, other, theirs.Email))
	})

	t.Run("should refuse the whole bulk delete when one id is unknown, and remove nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		unknown := uuid.NewString()

		// Action
		res, err := tn.Admin.API.BulkDeleteOrgMembershipsWithResponse(t.Context(), tn.OrgID.String(),
			api.BulkDeleteOrgMembershipsJSONRequestBody{MembershipIds: []string{membershipOf(t, tn, member).ID.String(), unknown}})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), unknown)
		require.NotNil(t, fixture.MembershipOf(t, tn, member.Email))
	})
}

func projectMemberEmails(t *testing.T, tn *harness.Tenant, proj *fixture.Project) []string {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListProjectMembershipsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var emails []string
	for _, m := range res.JSON200.Memberships {
		emails = append(emails, m.User.Username)
	}
	return emails
}

func groupMemberIDs(t *testing.T, tn *harness.Tenant, g *fixture.Group) []uuid.UUID {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListGroupUsersWithResponse(t.Context(), g.ID.String(), nil)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var ids []uuid.UUID
	for _, u := range res.JSON200.Users {
		if u.IsPartOfGroup {
			ids = append(ids, u.Id)
		}
	}
	return ids
}

func TestMembership_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer 404 when reading another org's membership id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		theirs := other.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := tn.Admin.API.GetOrgMembershipWithResponse(t.Context(), tn.OrgID.String(),
			membershipOf(t, other, theirs).ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "not found")
	})
}
