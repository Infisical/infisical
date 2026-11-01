package user_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestLogin_Password(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse unknown email and wrong password with the same invalid credentials answer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)

		// Action
		unknown, _ := login(t, tn, tn.Email("nobody-"+id.Short()), harness.UserPassword)
		wrong, _ := login(t, tn, alice.Email, "WrongPassword7!xyz")

		// Assert
		require.Equal(t, http.StatusBadRequest, unknown.StatusCode())
		require.Equal(t, unknown.StatusCode(), wrong.StatusCode())
		require.Equal(t, "Invalid credentials", apierr.Message(unknown.Body))
		require.Equal(t, apierr.Message(unknown.Body), apierr.Message(wrong.Body))
		require.Nil(t, cookieNamed(wrong.HTTPResponse, "jid"))
		again, _ := login(t, tn, alice.Email, harness.UserPassword)
		require.Equal(t, http.StatusOK, again.StatusCode())
	})

	t.Run("should return an org-less token that every org route refuses until an org is selected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)

		// Action
		s := loggedIn(t, tn, alice.Email)

		// Assert
		require.Equal(t, http.StatusUnauthorized, orgStatus(t, s.API, tn.OrgID.String()))
		require.Equal(t, http.StatusUnauthorized, meStatus(t, s.API))
		selected := selectOrg(t, tn, s, tn.OrgID.String())
		require.Equalf(t, http.StatusOK, selected.StatusCode(), "selecting: %s", apierr.Body(selected.Body))
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, selected.JSON200.Token, s.IP), tn.OrgID.String()))
	})

	t.Run("should mail a new-device notice for a new IP and user agent, and not for a repeat", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		first := signIn(t, tn, alice.Email)

		// Action
		signInFrom(t, tn, alice.Email, first.IP)

		// Assert
		tn.Mail(t).Expect(t, alice.Email, smtp.Subject("new device"), bodyContains(first.IP))
		tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(alice.Email) &&
				strings.Contains(e.Message.Subject, "new device") && strings.Contains(e.Message.Body, first.IP)
		})
	})
}

func TestSelectOrganization(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an org the user is not a member of", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		alice := tn.NewUser(t)
		s := loggedIn(t, tn, alice.Email)

		// Action
		res := selectOrg(t, tn, s, other.OrgID.String())

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "User does not have access to the organization with ID "+other.OrgID.String(), apierr.Message(res.Body))
		require.Nil(t, fixture.MembershipOf(t, other, alice.Email))
	})

	t.Run("should refuse an org whose membership is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		deactivate(t, tn, alice.Email)
		s := loggedIn(t, tn, alice.Email)

		// Action
		res := selectOrg(t, tn, s, tn.OrgID.String())

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "User organization membership is inactive", apierr.Message(res.Body))
		require.Nil(t, cookieNamed(res.HTTPResponse, "jid"))
	})

	t.Run("should accept an invited membership and mark it accepted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		alice := tn.NewUser(t)
		invite(t, other, alice.Email)
		require.Equal(t, "invited", fixture.MembershipOf(t, other, alice.Email).Status)
		s := loggedIn(t, tn, alice.Email)

		// Action
		res := selectOrg(t, tn, s, other.OrgID.String())

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting: %s", apierr.Body(res.Body))
		require.Equal(t, "accepted", fixture.MembershipOf(t, other, alice.Email).Status)
		require.Equal(t, http.StatusOK, orgStatus(t, as(t, tn, res.JSON200.Token, s.IP), other.OrgID.String()))
	})
}

func TestLogin_UserAgent(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a login without a user agent and issue no session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)

		// Action
		res, err := device(t, tn, newIP()).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
			Email:    alice.Email,
			Password: harness.UserPassword,
		}, func(_ context.Context, req *http.Request) error {
			req.Header.Set("User-Agent", "")
			return nil
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "User agent header is required", apierr.Message(res.Body))
		require.Nil(t, cookieNamed(res.HTTPResponse, "jid"))
	})
}

func bodyContains(s string) smtp.Filter {
	return func(m smtp.Message) bool { return strings.Contains(m.Body, s) }
}

// signInFrom is a full password login into the tenant's organization from a given
// address.
func signInFrom(t *testing.T, tn *harness.Tenant, email, ip string) session {
	t.Helper()
	res, err := device(t, tn, ip).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email:    email,
		Password: harness.UserPassword,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "logging in: %s", apierr.Body(res.Body))
	s := session{IP: ip, Token: res.JSON200.AccessToken, API: as(t, tn, res.JSON200.AccessToken, ip)}
	selected := selectOrg(t, tn, s, tn.OrgID.String())
	require.Equalf(t, http.StatusOK, selected.StatusCode(), "selecting the organization: %s", apierr.Body(selected.Body))
	return session{
		IP:    ip,
		Token: selected.JSON200.Token,
		JID:   cookieNamed(selected.HTTPResponse, "jid"),
		API:   as(t, tn, selected.JSON200.Token, ip),
	}
}

// invite adds an existing account to another tenant's organization as a member, leaving
// the membership invited until the user selects that organization.
func invite(t *testing.T, tn *harness.Tenant, email string) {
	t.Helper()
	res, err := tn.Admin.API.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(email)},
		OrganizationId:       tn.OrgID.String(),
		OrganizationRoleSlug: new("member"),
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "inviting %s: %s", email, apierr.Body(res.Body))
}

func deactivate(t *testing.T, tn *harness.Tenant, email string) {
	t.Helper()
	m := fixture.MembershipOf(t, tn, email)
	require.NotNil(t, m)
	res, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), m.ID.String(),
		api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "deactivating %s: %s", email, apierr.Body(res.Body))
}
