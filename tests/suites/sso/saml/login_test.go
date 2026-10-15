package saml_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSAMLLogin_NewUser(t *testing.T) {
	t.Parallel()

	t.Run("should send the user to SSO signup when they log in for the first time", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.person()

		// Action
		res := s.spLogin(t, alice)

		// Assert
		claims := s.signupClaims(t, res)
		require.Equal(t, "signupToken", claims["authTokenType"])
		require.Equal(t, string(okta), claims["authMethod"])
		require.Equal(t, alice.Email, claims["email"])
		require.Equal(t, alice.FirstName, claims["firstName"])
		require.Equal(t, alice.LastName, claims["lastName"])
		require.Equal(t, s.tn.OrgID.String(), claims["organizationId"])
		require.Nil(t, refreshCookie(res))
		require.Len(t, s.verificationCode(t, alice.Email), 6)
	})

	t.Run("should send the user to SSO signup when the login is IdP-initiated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.person()

		// Action
		res := s.idpLogin(t, alice)

		// Assert
		claims := s.signupClaims(t, res)
		require.Equal(t, alice.Email, claims["email"])
		require.Equal(t, s.tn.OrgID.String(), claims["organizationId"])
		require.Nil(t, refreshCookie(res))
	})

	t.Run("should accept the user into the org when signup completes with the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.person()
		acs := s.spLogin(t, alice)

		// Action
		res := s.completeSignup(t, acs, s.verificationCode(t, alice.Email))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
		require.Equal(t, "accepted", membershipOf(t, s.tn, alice.Email).status)
		session := s.session(t, s.spLogin(t, alice))
		org, err := session.GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
	})

	t.Run("should keep the user out when signup completes with a wrong code", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.person()
		acs := s.spLogin(t, alice)
		code := s.verificationCode(t, alice.Email)
		wrong := "000000"
		if code == wrong {
			wrong = "111111"
		}

		// Action
		res := s.completeSignup(t, acs, wrong)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Invalid token")
		require.Equal(t, "invited", membershipOf(t, s.tn, alice.Email).status)
		again := s.spLogin(t, alice)
		require.Equal(t, "/signup/sso", s.redirect(t, again).Path)
	})

	t.Run("should start a session without verification when the org enforces SAML", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		s.enforce(t)
		alice := s.person()

		// Action
		res := s.spLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.redirect(t, res).Path)
		session := s.session(t, res)
		org, err := session.GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
		require.Equal(t, "accepted", membershipOf(t, s.tn, alice.Email).status)
	})
}

func TestSAMLLogin_ReturningUser(t *testing.T) {
	t.Parallel()

	t.Run("should start a session when a verified user logs in again", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.signedUp(t)

		// Action
		res := s.spLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.redirect(t, res).Path)
		jid := refreshCookie(res)
		require.NotNil(t, jid)
		require.True(t, jid.HttpOnly)
		require.Equal(t, "/api", jid.Path)
		org, err := s.session(t, res).GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "reading the org: %s", apierr.Body(org.Body))
	})

	t.Run("should keep the callback port when the CLI starts the login", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.signedUp(t)
		req := s.startLogin(t, &api.RedirectSamlByOrgSlugParams{CallbackPort: new("5555")})

		// Action
		res := s.answer(t, req, alice)

		// Assert
		loc := s.redirect(t, res)
		require.Equal(t, "/login/select-organization", loc.Path)
		require.Equal(t, "5555", loc.Query().Get("callback_port"))
	})

	t.Run("should link to the existing account when a password user logs in with SAML", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		bob := s.tn.NewUser(t)
		person := s.person()
		person.Email = bob.Email

		// Action
		res := s.spLogin(t, person)

		// Assert
		claims := s.signupClaims(t, res)
		require.Equal(t, bob.ID.String(), claims["userId"])
		require.Equal(t, bob.ID, membershipOf(t, s.tn, bob.Email).userID)
	})

	t.Run("should refuse login when the membership is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.signedUp(t)
		m := membershipOf(t, s.tn, alice.Email)
		deactivated, err := s.tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), s.tn.OrgID.String(), m.id.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deactivated.StatusCode(), "deactivating: %s", apierr.Body(deactivated.Body))

		// Action
		res := s.spLogin(t, alice)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Saml authentication failed. User organization membership is inactive")
		require.Nil(t, refreshCookie(res))
		require.False(t, membershipOf(t, s.tn, alice.Email).isActive)
	})
}

func TestSAMLLogin_Attributes(t *testing.T) {
	t.Parallel()

	t.Run("should accept the email when the IdP sends the Entra email claim", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, azure)
		alice := s.person()
		entra := samlidp.Response{
			NameID:     alice.Email,
			FirstName:  alice.FirstName,
			Attributes: map[string][]string{samlidp.EntraEmailClaim: {alice.Email}},
		}

		// Action
		res := s.idpLogin(t, entra)

		// Assert
		require.Equal(t, alice.Email, s.signupClaims(t, res)["email"])
	})

	t.Run("should store extra attributes as identity metadata when the IdP sends them", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, okta)
		alice := s.signedUp(t)
		alice.Attributes = map[string][]string{
			"department": {"Engineering"},
			"http://schemas.example.com/claims/costcenter": {"cc-42"},
		}

		// Action
		res := s.spLogin(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", s.redirect(t, res).Path)
		m := membershipOf(t, s.tn, alice.Email)
		got, err := s.tn.Admin.API.GetOrgMembershipWithResponse(t.Context(), s.tn.OrgID.String(), m.id.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading membership: %s", apierr.Body(got.Body))
		metadata := map[string]string{}
		for _, kv := range *got.JSON200.Membership.Metadata {
			metadata[kv.Key] = kv.Value
		}
		require.Equal(t, map[string]string{"department": "Engineering", "costcenter": "cc-42"}, metadata)
	})
}
