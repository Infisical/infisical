package suborganization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestSubOrganization_Membership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove a user from every sub-org and sub-org group when removed from the root", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first, second := fixture.NewSubOrg(t, tn), fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		addToSubOrg(t, first, member, "member")
		addToSubOrg(t, second, member, "member")
		groupID := first.NewGroup(t, "native")
		added, err := first.Admin.API.AddUserToGroupWithResponse(t.Context(), groupID.String(), member.Email)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		membership := fixture.MembershipOf(t, tn, member.Email)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotContains(t, memberUserIDs(t, first.Admin.API, first.ID), member.ID)
		require.NotContains(t, memberUserIDs(t, second.Admin.API, second.ID), member.ID)
		require.Empty(t, fixture.GroupUserIDs(t, first.Admin.API, groupID))
	})

	t.Run("should keep a user's access through a linked root group when the sub-org removes their membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		addToSubOrg(t, sub, member, "member")
		linked := fixture.NewGroup(t, tn)
		linked.AddUser(t, member)
		sub.LinkGroup(t, linked, "member")

		// Action
		res, err := sub.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), sub.ID.String(), membershipID(t, sub, member.ID).String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{member.ID}, fixture.GroupUserIDs(t, tn.Admin.API, linked.ID))
		selected := selectOrg(t, tn, member.Token, sub.ID)
		requireStatus(t, http.StatusOK, selected.StatusCode(), selected.Body)
	})

	removals := []struct {
		route  string
		remove func(*testing.T, *fixture.SubOrg, uuid.UUID) (int, []byte)
	}{
		{"its org membership", func(t *testing.T, sub *fixture.SubOrg, identityID uuid.UUID) (int, []byte) {
			res, err := sub.Admin.API.DeleteOrganizationIdentityMembershipWithResponse(t.Context(), identityID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the identity", func(t *testing.T, sub *fixture.SubOrg, identityID uuid.UUID) (int, []byte) {
			res, err := sub.Admin.API.DeleteMachineIdentityWithResponse(t.Context(), identityID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
	}
	for _, removal := range removals {
		t.Run("should refuse a root identity's login through the sub-org's own group when the sub-org deletes "+removal.route, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			sub := fixture.NewSubOrg(t, tn)
			ua := newUniversalAuth(t, tn)
			sub.LinkIdentity(t, ua.IdentityID, "no-access")
			ownGroupID := sub.NewGroup(t, "native")
			added, err := sub.Admin.API.AddMachineIdentityToGroupWithResponse(t.Context(), ownGroupID.String(), ua.IdentityID.String())
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)

			// Action
			status, body := removal.remove(t, sub, ua.IdentityID)

			// Assert
			requireStatus(t, http.StatusOK, status, body)
			login := ua.login(t, tn, sub.Slug)
			requireStatus(t, http.StatusUnauthorized, login.StatusCode(), login.Body)
			require.Contains(t, string(login.Body), "Identity not authorized to access sub organization "+sub.Slug)
		})
	}

	t.Run("should keep a root identity's access through a linked root group when the sub-org removes its membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		ua := newUniversalAuth(t, tn)
		sub.LinkIdentity(t, ua.IdentityID, "no-access")
		linked := fixture.NewGroup(t, tn)
		linked.AddIdentity(t, identityPrincipal(ua))
		sub.LinkGroup(t, linked, "member")

		// Action
		res, err := sub.Admin.API.DeleteOrganizationIdentityMembershipWithResponse(t.Context(), ua.IdentityID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{ua.IdentityID}, groupIdentityIDs(t, tn.Admin.API, linked.ID))
		login := ua.login(t, tn, sub.Slug)
		requireStatus(t, http.StatusOK, login.StatusCode(), login.Body)
	})

	t.Run("should refuse inviting a user who is not in the root org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		admin := tn.Client(t, sub.Admin.Token, infisical.ForwardedFor(sourceIP()))

		// Action
		res, err := admin.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
			InviteeEmails:  []openapi_types.Email{openapi_types.Email(tn.Email("stranger"))},
			OrganizationId: sub.ID.String(),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "doesn't have membership in root organization")
		require.Equal(t, []uuid.UUID{tn.Admin.ID}, memberUserIDs(t, sub.Admin.API, sub.ID))
	})

	t.Run("should refuse selecting the sub-org when the root membership is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		addToSubOrg(t, sub, member, "member")
		membership := fixture.MembershipOf(t, tn, member.Email)
		deactivated, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, deactivated.StatusCode(), deactivated.Body)
		session := passwordLogin(t, tn, member.Email)

		// Action
		res := selectOrg(t, tn, session, sub.ID)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "User organization membership is inactive")
	})
}

// membershipID is a user's direct membership in the sub-org, as its admin sees it.
func membershipID(t *testing.T, sub *fixture.SubOrg, userID uuid.UUID) uuid.UUID {
	t.Helper()
	res, err := sub.Admin.API.ListOrgMembershipsWithResponse(t.Context(), sub.ID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the members of %s returned %d: %s", sub.Slug, res.StatusCode(), res.Body)
	for _, m := range res.JSON200.Users {
		if m.User.Id == userID {
			return m.Id
		}
	}
	t.Fatalf("user %s has no membership in %s", userID, sub.Slug)
	return uuid.Nil
}
