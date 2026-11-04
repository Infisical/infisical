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
