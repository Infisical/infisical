package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestScimUser_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should add the person as an invited member with the default role and mail them an invite", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()

		// Action
		user := s.provision(t, p)

		// Assert
		require.Equal(t, p.userName, user.UserName)
		require.True(t, user.Active)
		m := fixture.MembershipOf(t, s.tn, p.email)
		require.Equal(t, fixture.Membership{ID: m.ID, UserID: m.UserID, Status: "invited", IsActive: true, Role: "member"}, *m)
		s.tn.Mail(t).Expect(t, p.email, smtp.Subject("Infisical organization invitation"))
	})

	t.Run("should give the person the org's default membership role", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		res, err := s.tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), s.tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{DefaultMembershipRoleSlug: new("no-access")})
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "setting the default role")
		p := s.person()

		// Action
		s.provision(t, p)

		// Assert
		require.Equal(t, "no-access", fixture.MembershipOf(t, s.tn, p.email).Role)
	})

	t.Run("should reuse the account when the person already belongs to another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		elsewhere := h.NewTenant(t)
		invited, err := elsewhere.Admin.API.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
			OrganizationId: elsewhere.OrgID.String(),
			InviteeEmails:  []openapi_types.Email{openapi_types.Email(p.email)},
		})
		require.NoError(t, err)
		requireOK(t, reply{invited.StatusCode(), invited.Body}, "inviting the person elsewhere")

		// Action
		s.provision(t, p)

		// Assert
		require.Equal(t, fixture.MembershipOf(t, elsewhere, p.email).UserID, fixture.MembershipOf(t, s.tn, p.email).UserID)
	})

	t.Run("should return the same member and add no second membership when the person is provisioned twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		first := s.provision(t, p)

		// Action
		second := s.provision(t, p)

		// Assert
		require.Equal(t, first.ID, second.ID)
		require.Len(t, s.findUsers(t, `userName eq "`+p.userName+`"`), 1)
	})

	t.Run("should refuse and add nobody when the email is not on a verified domain of the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		p.email = "outsider@unverified-" + id.Short() + ".test"

		// Action
		r := s.createUser(t, userBody(p))

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.Contains(t, errorText(t, r), "not a part of the accepted domains")
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse and add nobody when no primary email is sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		body := userBody(p)
		body["emails"] = []map[string]any{{"primary": false, "value": p.email}}

		// Action
		r := s.createUser(t, body)

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "Invalid request. Missing email.", errorText(t, r))
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse a malformed email", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		p.email = "not-an-email"

		// Action
		r := s.createUser(t, userBody(p))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, r.status)
		require.Empty(t, s.findUsers(t, `userName eq "`+p.userName+`"`))
	})

	t.Run("should add the member deactivated when the IdP provisions them suspended", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		body := userBody(p)
		body["active"] = false

		// Action
		r := s.createUser(t, body)

		// Assert
		require.False(t, decode[scimUser](t, r).Active)
		require.False(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
		s.tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == p.email })
	})
}
