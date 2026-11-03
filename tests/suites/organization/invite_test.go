package organization_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestInvite_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should mail an invite and give the requested org role and project access", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		addr := tn.Email("invitee")

		// Action
		res, err := fresh(t, tn, tn.Admin).InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
			InviteeEmails:        []openapi_types.Email{openapi_types.Email(addr)},
			OrganizationId:       tn.OrgID.String(),
			OrganizationRoleSlug: new("admin"),
			ProjectIds:           &[]string{proj.ID},
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, res.JSON200.GrantFailures)
		tn.Mail(t).Expect(t, addr, smtp.Subject("invitation"))
		m := fixture.MembershipOf(t, tn, addr)
		require.NotNil(t, m)
		require.Equal(t, "admin", m.Role)
		require.Equal(t, "invited", m.Status)
		require.Contains(t, projectMemberEmails(t, tn, proj), addr)
	})

	t.Run("should refuse a role the actor cannot grant and mail nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		inviter := customRoleUser(t, tn, "inviter",
			fixture.Permission{Subject: "member", Action: []string{"read", "create"}})
		addr := tn.Email("escalated")

		// Action
		res := invite(t, tn, inviter, "admin", addr)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Permission denied: grant-privileges on member")
		require.Nil(t, fixture.MembershipOf(t, tn, addr))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == addr })
	})

	t.Run("should refuse invitees off the verified domains when SSO is enforced", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewSAML(t, tn, sso.Okta).Enforce(t)
		outsider := "outsider@" + id.Nonce() + ".test"

		// Action
		res := invite(t, tn, tn.Admin, "member", outsider)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Only users with a verified organization email domain can be invited")
		require.Nil(t, fixture.MembershipOf(t, tn, outsider))
	})

	t.Run("should refuse a member without member create and mail nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		addr := tn.Email("uninvited")

		// Action
		res := invite(t, tn, member, "member", addr)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Nil(t, fixture.MembershipOf(t, tn, addr))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == addr })
	})

	t.Run("should refuse invites past the plan's member limit and mail nobody", func(t *testing.T) {
		t.Parallel()

		spec.Why(t, `The admin sits only in the bootstrapped product projects, which are not
			billed, so the one seat in use is the machine identity.`)

		// Setup
		limited := license.Enterprise().With(license.MaxIdentityLimit, 1)
		limited.Slug = "pro"
		tn := h.NewTenant(t, harness.WithPlan(limited))
		tn.NewMachineIdentity(t)
		addr := tn.Email("overflow")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "member limit reached")
		require.Nil(t, fixture.MembershipOf(t, tn, addr))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == addr })
	})
}

func TestInvite_Resend(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a resend for an accepted invite and mail nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		mark := tn.Mail(t).Mark(t)

		// Action
		res, err := fresh(t, tn, tn.Admin).ResendOrganizationMemberInvitationWithResponse(t.Context(),
			api.ResendOrganizationMemberInvitationJSONRequestBody{MembershipId: membershipOf(t, tn, member).ID.String()})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Organization invitation already accepted")
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t,
			func(e smtp.MessageReceived) bool {
				return e.Recipient == member.Email && strings.Contains(e.Message.Subject, "invitation")
			}, fakenet.Since(mark))
	})
}
