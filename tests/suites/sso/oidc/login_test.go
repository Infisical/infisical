package oidc_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOIDCLogin_NewUser(t *testing.T) {
	t.Parallel()

	t.Run("should send the user to SSO signup and mail a code when they log in for the first time", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := o.Person()

		// Action
		res := o.Login(t, alice)

		// Assert
		claims := o.SignupClaims(t, res)
		require.Equal(t, "signupToken", claims["authTokenType"])
		require.Equal(t, "oidc", claims["authMethod"])
		require.Equal(t, alice.Email, claims["email"])
		require.Equal(t, alice.GivenName, claims["firstName"])
		require.Equal(t, alice.FamilyName, claims["lastName"])
		require.Equal(t, o.Tenant.OrgID.String(), claims["organizationId"])
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Len(t, sso.VerificationCode(t, o.Tenant, alice.Email), 6)
	})

	t.Run("should accept the user into the org when signup completes with the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := o.Person()
		login := o.Login(t, alice)

		// Action
		res := o.CompleteSignup(t, login, sso.VerificationCode(t, o.Tenant, alice.Email))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
		require.Equal(t, "accepted", fixture.MembershipOf(t, o.Tenant, alice.Email).Status)
		require.Equal(t, http.StatusOK, readOrg(t, o.Session(t, o.Login(t, alice)), o.Tenant))
	})

	t.Run("should keep the user out when signup completes with a wrong code", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := o.Person()
		login := o.Login(t, alice)
		code := sso.VerificationCode(t, o.Tenant, alice.Email)
		wrong := "000000"
		if code == wrong {
			wrong = "111111"
		}

		// Action
		res := o.CompleteSignup(t, login, wrong)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Invalid token")
		require.Equal(t, "invited", fixture.MembershipOf(t, o.Tenant, alice.Email).Status)
		require.Equal(t, "/signup/sso", o.Redirect(t, o.Login(t, alice)).Path)
	})

	t.Run("should start a session without verification when the org enforces OIDC", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		enforce(t, o)
		alice := o.Person()

		// Action
		res := o.Login(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", o.Redirect(t, res).Path)
		require.Equal(t, http.StatusOK, readOrg(t, o.Session(t, res), o.Tenant))
		require.Equal(t, "accepted", fixture.MembershipOf(t, o.Tenant, alice.Email).Status)
	})
}

func TestOIDCLogin_ReturningUser(t *testing.T) {
	t.Parallel()

	t.Run("should start a session when a verified user logs in again", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := signedUp(t, o)

		// Action
		res := o.Login(t, alice)

		// Assert
		require.Equal(t, "/login/select-organization", o.Redirect(t, res).Path)
		jid := sso.RefreshCookie(res.HTTPResponse)
		require.NotNil(t, jid)
		require.True(t, jid.HttpOnly)
		require.Equal(t, "/api", jid.Path)
		require.Equal(t, http.StatusOK, readOrg(t, o.Session(t, res), o.Tenant))
	})

	t.Run("should refuse login without a session when the membership is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := signedUp(t, o)
		m := fixture.MembershipOf(t, o.Tenant, alice.Email)
		deactivated, err := o.Tenant.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), o.Tenant.OrgID.String(), m.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deactivated.StatusCode(), "deactivating: %s", apierr.Body(deactivated.Body))

		// Action
		res := o.Login(t, alice)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "User organization membership is inactive")
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.False(t, fixture.MembershipOf(t, o.Tenant, alice.Email).IsActive)
	})
}

func TestOIDCLogin_AllowedEmailDomains(t *testing.T) {
	t.Parallel()

	t.Run("should refuse login without creating the user when the email is outside the allowed domains", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId:      o.Tenant.OrgID.String(),
			AllowedEmailDomains: new("allowed.test"),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		alice := o.Person()

		// Action
		login := o.Login(t, alice)

		// Assert
		require.Equal(t, http.StatusForbidden, login.StatusCode())
		require.Contains(t, string(login.Body), "Email not allowed.")
		require.Nil(t, sso.RefreshCookie(login.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, o.Tenant, alice.Email))
	})

	t.Run("should let the user in when their domain is on the allowed list", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := o.Person()
		_, domain, _ := strings.Cut(alice.Email, "@")
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId:      o.Tenant.OrgID.String(),
			AllowedEmailDomains: new("allowed.test, " + domain),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))

		// Action
		login := o.Login(t, alice)

		// Assert
		require.Equal(t, alice.Email, o.SignupClaims(t, login)["email"])
	})
}
