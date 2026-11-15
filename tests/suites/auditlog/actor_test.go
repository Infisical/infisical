package auditlog_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_Actor(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record a user actor with id, email, IP and user agent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ip := sourceIP()

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{Name: new("renamed-" + id.Short())}, from(ip, "terraform"))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, tn.Admin, filter{EventType: new("update-org")}, 1)[0]
		require.Equal(t, "user", got.ActorType)
		require.Equal(t, tn.Admin.ID.String(), got.Actor["userId"])
		require.Equal(t, tn.Admin.Email, got.Actor["email"])
		require.Equal(t, ip, got.IP)
		require.Equal(t, "terraform", got.UserAgent)
		require.Equal(t, "terraform", got.UserAgentType)
	})

	t.Run("should record a machine identity actor with id and name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		groupID := createGroup(t, bot, "by-bot-"+id.Short())

		// Assert
		got := waitForEvent(t, tn.Admin, "create-group", func(e entry) bool { return e.Metadata["groupId"] == groupID })
		require.Equal(t, "identity", got.ActorType)
		require.Equal(t, bot.ID.String(), got.Actor["identityId"])
		require.Equal(t, bot.Name, got.Actor["name"])
	})

	t.Run("should record ORG_ADMIN_BYPASS_SSO and mail the other admins on break-glass", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		saml := sso.NewSAML(t, tn, sso.Okta)
		otherAdmin := tn.NewUser(t, harness.OrgRole("admin"))
		saml.Enforce(t)

		// Action
		res, err := tn.Admin.API.SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, tn.Admin, filter{EventType: new("org-admin-bypassed-sso")}, 1)
		require.Len(t, got, 1)
		require.Equal(t, "user", got[0].ActorType)
		require.Equal(t, tn.Admin.ID.String(), got[0].Actor["userId"])
		require.Equal(t, tn.Admin.Email, got[0].Actor["email"])
		mail := tn.Mail(t).Expect(t, otherAdmin.Email, smtp.Subject("SSO Bypass"))
		require.Contains(t, mail.Body, tn.Admin.Email)
	})
}

func TestAuditLog_OrgEvents(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record an org update with the fields that changed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		name := "renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{Name: &name})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, tn.Admin, filter{EventType: new("update-org")}, 1)
		require.Len(t, got, 1)
		require.Equal(t, name, got[0].Metadata["name"])
		require.Equal(t, "management", got[0].Class)
	})

	t.Run("should record a membership removal with the membership and user", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		membership := fixture.MembershipOf(t, tn, alice.Email)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, tn.Admin, filter{EventType: new("delete-user-org-membership")}, 1)
		require.Len(t, got, 1)
		require.Equal(t, membership.ID.String(), got[0].Metadata["membershipId"])
		require.Equal(t, alice.ID.String(), got[0].Metadata["userId"])
		require.Equal(t, tn.Admin.ID.String(), got[0].Actor["userId"])
	})

	t.Run("should record an org selection with the org's id and name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		org, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		require.NotNil(t, org.JSON200)
		before := len(waitForEvents(t, tn.Admin, selectionsBy(alice), 1))

		// Action
		res, err := alice.API.SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, tn.Admin, selectionsBy(alice), before+1)
		require.Equal(t, tn.OrgID.String(), got[0].Metadata["organizationId"])
		require.Equal(t, org.JSON200.Organization.Name, got[0].Metadata["organizationName"])
		require.Equal(t, alice.Email, got[0].Actor["email"])
	})

	t.Run("should record a group's creation and a member joining it with readable names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))

		// Action
		g := fixture.NewGroup(t, tn, fixture.WithGroupRole("member"))
		g.AddUser(t, alice)

		// Assert
		created := waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 1)
		require.Len(t, created, 1)
		require.Equal(t, g.ID.String(), created[0].Metadata["groupId"])
		require.Equal(t, g.Name, created[0].Metadata["name"])
		require.Equal(t, g.Slug, created[0].Metadata["slug"])
		require.Equal(t, "member", created[0].Metadata["role"])
		added := waitForEvents(t, tn.Admin, filter{EventType: new("add-user-to-group")}, 1)
		require.Len(t, added, 1)
		require.Equal(t, g.Name, added[0].Metadata["groupName"])
		require.Equal(t, alice.ID.String(), added[0].Metadata["userId"])
		require.True(t, strings.EqualFold(alice.Email, added[0].Metadata["username"].(string)),
			"username %v is not %s", added[0].Metadata["username"], alice.Email)
	})

	t.Run("should record a group linked to a sub-org in the sub-org's log", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		g := fixture.NewGroup(t, tn)

		// Action
		res, err := sub.Admin.API.CreateOrganizationGroupMembershipWithBodyWithResponse(t.Context(), g.ID,
			"application/json", jsonBody(t, map[string]any{"roles": []map[string]any{{"role": "member"}}}))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := waitForEvents(t, sub.Admin, filter{EventType: new("link-group-to-sub-org")}, 1)
		require.Len(t, got, 1)
		require.Equal(t, g.ID.String(), got[0].Metadata["groupId"])
		require.Equal(t, g.Name, got[0].Metadata["groupName"])
		roles, ok := got[0].Metadata["roles"].([]any)
		require.Truef(t, ok, "metadata has no roles: %+v", got[0].Metadata)
		require.Len(t, roles, 1)
		require.Equal(t, "member", roles[0].(map[string]any)["role"])
		require.Empty(t, events(t, tn.Admin, filter{EventType: new("link-group-to-sub-org")}),
			"the link belongs to the sub-org's log, not the root's")
	})
}

func TestAuditLog_OrgInvite(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record an org invitation naming the invitee and the role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		invitee := tn.Email("invitee")

		// Action
		res, err := tn.Admin.API.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
			InviteeEmails:  []openapi_types.Email{openapi_types.Email(invitee)},
			OrganizationId: tn.OrgID.String(),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		tn.Mail(t).Expect(t, invitee, smtp.Subject("invitation"))
		event := waitForEvent(t, tn.Admin, "invite-org-members", func(e entry) bool {
			return strings.Contains(strings.ToLower(jsonString(t, e.Metadata)), invitee)
		})
		require.Equal(t, "member", event.Metadata["organizationRoleSlug"])
	})

	t.Run("should name each project the invitation grants access to", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		invitee := tn.Email("invitee")

		// Action
		res, err := tn.Admin.API.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
			InviteeEmails:  []openapi_types.Email{openapi_types.Email(invitee)},
			OrganizationId: tn.OrgID.String(),
			ProjectIds:     &[]string{proj.ID},
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		event := waitForEvent(t, tn.Admin, "invite-org-members", func(e entry) bool {
			return strings.Contains(strings.ToLower(jsonString(t, e.Metadata)), invitee)
		})
		require.Equal(t, []any{map[string]any{"id": proj.ID, "name": proj.Name}}, event.Metadata["projects"])
	})
}

func selectionsBy(user *harness.Principal) filter {
	return filter{
		EventType: new("select-organization"),
		ActorType: new(api.ListOrganizationAuditLogsParamsActorTypeUser),
		Actor:     new(user.ID.String()),
	}
}
