package saml_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSAMLLogin_NewUser(t *testing.T) {
	t.Parallel()

	t.Run("should send the user to SSO signup when they log in for the first time", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.Person()

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		claims := s.SignupClaims(t, res)
		require.Equal(t, "signupToken", claims["authTokenType"])
		require.Equal(t, string(sso.Okta), claims["authMethod"])
		require.Equal(t, alice.Email, claims["email"])
		require.Equal(t, alice.FirstName, claims["firstName"])
		require.Equal(t, alice.LastName, claims["lastName"])
		require.Equal(t, s.Tenant.OrgID.String(), claims["organizationId"])
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Len(t, s.VerificationCode(t, alice.Email), 6)
	})

	t.Run("should send the user to SSO signup when the login is IdP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.Person()

		// Action
		res := s.IdPLogin(t, alice)

		// Assert
		claims := s.SignupClaims(t, res)
		require.Equal(t, alice.Email, claims["email"])
		require.Equal(t, s.Tenant.OrgID.String(), claims["organizationId"])
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
	})

	t.Run("should accept the user into the org when signup completes with the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.Person()
		acs := s.SPLogin(t, alice)

		// Action
		res := s.CompleteSignup(t, acs, s.VerificationCode(t, alice.Email))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
		require.Equal(t, "accepted", fixture.MembershipOf(t, s.Tenant, alice.Email).Status)
		session := s.Session(t, s.SPLogin(t, alice))
		org, err := session.GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
	})

	t.Run("should keep the user out when signup completes with a wrong code", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.Person()
		acs := s.SPLogin(t, alice)
		code := s.VerificationCode(t, alice.Email)
		wrong := "000000"
		if code == wrong {
			wrong = "111111"
		}

		// Action
		res := s.CompleteSignup(t, acs, wrong)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Invalid token")
		require.Equal(t, "invited", fixture.MembershipOf(t, s.Tenant, alice.Email).Status)
		again := s.SPLogin(t, alice)
		require.Equal(t, "/signup/sso", s.Redirect(t, again).Path)
	})

	t.Run("should start a session without verification when the org enforces SAML", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)
		alice := s.Person()

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.Redirect(t, res).Path)
		session := s.Session(t, res)
		org, err := session.GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
		require.Equal(t, "accepted", fixture.MembershipOf(t, s.Tenant, alice.Email).Status)
	})
}

func TestSAMLLogin_ReturningUser(t *testing.T) {
	t.Parallel()

	t.Run("should start a session when a verified user logs in again", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.Redirect(t, res).Path)
		jid := sso.RefreshCookie(res.HTTPResponse)
		require.NotNil(t, jid)
		require.True(t, jid.HttpOnly)
		require.Equal(t, "/api", jid.Path)
		org, err := s.Session(t, res).GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
	})

	t.Run("should keep the callback port when the CLI starts the login", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		req := s.StartLogin(t, &api.RedirectSamlByOrgSlugParams{CallbackPort: new("5555")})

		// Action
		res := s.Answer(t, req, alice)

		// Assert
		loc := s.Redirect(t, res)
		require.Equal(t, "/login/select-organization", loc.Path)
		require.Equal(t, "5555", loc.Query().Get("callback_port"))
	})

	t.Run("should link to the existing account when a password user logs in with SAML", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		bob := s.Tenant.NewUser(t)
		person := s.Person()
		person.Email = bob.Email

		// Action
		res := s.SPLogin(t, person)

		// Assert
		claims := s.SignupClaims(t, res)
		require.Equal(t, bob.ID.String(), claims["userId"])
		require.Equal(t, bob.ID, fixture.MembershipOf(t, s.Tenant, bob.Email).UserID)
	})

	t.Run("should refuse login when the membership is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		m := fixture.MembershipOf(t, s.Tenant, alice.Email)
		deactivated, err := s.Tenant.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), s.Tenant.OrgID.String(), m.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deactivated.StatusCode(), "deactivating: %s", apierr.Body(deactivated.Body))

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. User organization membership is inactive")
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.False(t, fixture.MembershipOf(t, s.Tenant, alice.Email).IsActive)
	})
}

func TestSAMLLogin_Attributes(t *testing.T) {
	t.Parallel()

	t.Run("should accept the email when the IdP sends the Entra email claim", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Azure)
		alice := s.Person()
		entra := samlidp.Response{
			NameID:     alice.Email,
			FirstName:  alice.FirstName,
			Attributes: map[string][]string{samlidp.EntraEmailClaim: {alice.Email}},
		}

		// Action
		res := s.IdPLogin(t, entra)

		// Assert
		require.Equal(t, alice.Email, s.SignupClaims(t, res)["email"])
	})

	t.Run("should store extra attributes as identity metadata when the IdP sends them", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		alice.Attributes = map[string][]string{
			"department": {"Engineering"},
			"http://schemas.example.com/claims/costcenter": {"cc-42"},
		}

		// Action
		res := s.SPLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.Redirect(t, res).Path)
		m := fixture.MembershipOf(t, s.Tenant, alice.Email)
		got, err := s.Tenant.Admin.API.GetOrgMembershipWithResponse(t.Context(), s.Tenant.OrgID.String(), m.ID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading membership: %s", apierr.Body(got.Body))
		metadata := map[string]string{}
		for _, kv := range *got.JSON200.Membership.Metadata {
			metadata[kv.Key] = kv.Value
		}
		require.Equal(t, map[string]string{"department": "Engineering", "costcenter": "cc-42"}, metadata)
	})
}
