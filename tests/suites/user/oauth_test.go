package user_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	githubfake "github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestOAuth_Signup(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should send a first-time user with a provider-verified email to select-organization with a session, and create the account", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				loc := res.Redirect(t)
				require.Equal(t, "/login/select-organization", loc.Path)
				require.Equal(t, "true", loc.Query().Get("signup_completed"))
				me := accountOf(t, tn, res).JSON200.User
				require.Equal(t, strings.ToLower(p.Email), *me.Email)
				require.Contains(t, *me.AuthMethods, string(kind))
			})
		}
	})

	t.Run("should send a first-time user with an unverified email to SSO signup and mail a code", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, false)

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				loc := res.Redirect(t)
				require.Equal(t, "/signup/sso", loc.Path)
				signup := claims(t, loc.Query().Get("token"))
				require.Equal(t, "signupToken", signup["authTokenType"])
				require.Equal(t, strings.ToLower(p.Email), signup["email"])
				require.Equal(t, string(kind), signup["authMethod"])
				require.Nil(t, cookieNamed(res.HTTP, "jid"))
				require.Len(t, sso.VerificationCode(t, tn, p.Email), 6)
			})
		}
	})

	t.Run("should complete signup with the mailed code and refuse a wrong code", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, false)
				first := fixture.OAuthLogin(t, tn, kind, p)
				require.Equal(t, "/signup/sso", first.Redirect(t).Path)
				mailed := sso.VerificationCode(t, tn, p.Email)

				// Action
				wrong := sso.CompleteSignup(t, tn, first.HTTP, otherCode(mailed))
				right := sso.CompleteSignup(t, tn, first.HTTP, mailed)

				// Assert
				require.Equal(t, http.StatusBadRequest, wrong.StatusCode())
				require.Equal(t, "Invalid token", apierr.Message(wrong.Body))
				require.Equalf(t, http.StatusOK, right.StatusCode(), "completing: %s", apierr.Body(right.Body))
				again := fixture.OAuthLogin(t, tn, kind, p)
				require.Equal(t, "/login/select-organization", again.Redirect(t).Path)
				require.Equal(t, strings.ToLower(p.Email), *accountOf(t, tn, again).JSON200.User.Email)
			})
		}
	})

	t.Run("should prefer GitHub's primary verified email, then any verified email", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		secondary, primary := tn.Email("x-"+id.Short()), tn.Email("x-"+id.Short())
		unverifiedPrimary, verified := tn.Email("x-"+id.Short()), tn.Email("x-"+id.Short())

		// Action
		withPrimary := fixture.StartOAuth(t, tn, fixture.OAuthGitHub).Finish(t, fixture.OAuthGitHub, fixture.OAuthConsentGitHub(t, tn, fixture.NewOAuthAccountID(),
			githubfake.Email{Email: secondary, Verified: true},
			githubfake.Email{Email: primary, Primary: true, Verified: true},
		))
		withoutPrimary := fixture.StartOAuth(t, tn, fixture.OAuthGitHub).Finish(t, fixture.OAuthGitHub, fixture.OAuthConsentGitHub(t, tn, fixture.NewOAuthAccountID(),
			githubfake.Email{Email: unverifiedPrimary, Primary: true},
			githubfake.Email{Email: verified, Verified: true},
		))

		// Assert
		require.Equal(t, strings.ToLower(primary), *accountOf(t, tn, withPrimary).JSON200.User.Email)
		require.Equal(t, strings.ToLower(verified), *accountOf(t, tn, withoutPrimary).JSON200.User.Email)
	})
}

func TestOAuth_ExistingAccount(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should link a returning provider login to the existing password account when the provider verified the email", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				alice := tn.NewUser(t)
				p := fixture.NewOAuthPerson(tn, true)
				p.Email = alice.Email

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				require.Equal(t, "/login/select-organization", res.Redirect(t).Path)
				me := accountOf(t, tn, res).JSON200.User
				require.Equal(t, alice.ID, me.Id)
				require.Contains(t, *me.AuthMethods, "email")
				require.Contains(t, *me.AuthMethods, string(kind))
			})
		}
	})

	t.Run("should refuse to link or modify an existing account from an unverified provider email", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				alice := tn.NewUser(t)
				p := fixture.NewOAuthPerson(tn, false)
				p.Email = alice.Email

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				require.Equal(t, "/signup/sso", res.Redirect(t).Path)
				require.Nil(t, cookieNamed(res.HTTP, "jid"))
				me, err := alice.API.GetCurrentUserWithResponse(t.Context())
				require.NoError(t, err)
				require.Equal(t, []string{"email"}, *me.JSON200.User.AuthMethods)
				require.Equal(t, alice.Name, *me.JSON200.User.FirstName)
			})
		}
	})

	t.Run("should rename the account when the provider's email changes", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)
				before := accountOf(t, tn, fixture.OAuthLogin(t, tn, kind, p)).JSON200.User
				p.Email = tn.Email("renamed-" + id.Short())

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				require.Equal(t, "/login/select-organization", res.Redirect(t).Path)
				after := accountOf(t, tn, res).JSON200.User
				require.Equal(t, before.Id, after.Id)
				require.Equal(t, strings.ToLower(p.Email), *after.Email)
				require.Equal(t, strings.ToLower(p.Email), after.Username)
			})
		}
	})

	t.Run("should refuse to rename the account to an email that belongs to another account", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				bob := tn.NewUser(t)
				p := fixture.NewOAuthPerson(tn, true)
				original := p.Email
				before := accountOf(t, tn, fixture.OAuthLogin(t, tn, kind, p)).JSON200.User
				p.Email = bob.Email

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p)

				// Assert
				require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
				require.Contains(t, apierr.Message(res.Body), "already in use by another Infisical user")
				require.Nil(t, cookieNamed(res.HTTP, "jid"))
				p.Email = original
				after := accountOf(t, tn, fixture.OAuthLogin(t, tn, kind, p)).JSON200.User
				require.Equal(t, before.Id, after.Id)
				require.Equal(t, strings.ToLower(original), *after.Email)
				me, err := bob.API.GetCurrentUserWithResponse(t.Context())
				require.NoError(t, err)
				require.Equal(t, []string{"email"}, *me.JSON200.User.AuthMethods)
			})
		}
	})
}

func TestOAuth_Callback(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a callback with a forged state, and create no account", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)
				b := fixture.StartOAuth(t, tn, kind)
				cp := fixture.OAuthConsent(t, tn, kind, p)

				// Action
				res, err := b.Callback(t.Context(), kind, cp.Code, "forged-"+id.Short(), b.Cookies...)

				// Assert
				require.NoError(t, err)
				requireNoSession(t, res)
				require.False(t, cp.State(t).Redeemed, "Infisical redeemed a code that came back with a forged state")
				require.Equal(t, "true", fixture.OAuthLogin(t, tn, kind, p).Redirect(t).Query().Get("signup_completed"))
			})
		}
	})

	t.Run("should refuse a login whose PKCE verifier does not match the redirect's challenge, and create no account", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)
				b := fixture.StartOAuth(t, tn, kind)
				cp := fixture.OAuthConsent(t, tn, kind, p)
				other := sha256.Sum256([]byte("not-the-verifier-" + id.Short()))
				cp.Seed(t, oauth.Grant{CodeChallenge: base64.RawURLEncoding.EncodeToString(other[:])})

				// Action
				res, err := b.Callback(t.Context(), kind, cp.Code, b.State, b.Cookies...)

				// Assert
				require.NoError(t, err)
				require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
				require.Contains(t, apierr.Message(res.Body), "did not accept the login's authorization code")
				requireNoSession(t, res)
				require.False(t, cp.State(t).Redeemed)
				require.Equal(t, "true", fixture.OAuthLogin(t, tn, kind, p).Redirect(t).Query().Get("signup_completed"))
			})
		}
	})

	t.Run("should refuse a callback without the redirect's session cookie, and create no account", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)
				b := fixture.StartOAuth(t, tn, kind)
				cp := fixture.OAuthConsent(t, tn, kind, p)

				// Action
				res, err := b.Callback(t.Context(), kind, cp.Code, b.State)

				// Assert
				require.NoError(t, err)
				requireNoSession(t, res)
				require.False(t, cp.State(t).Redeemed, "Infisical redeemed a code without the browser's session")
				require.Equal(t, "true", fixture.OAuthLogin(t, tn, kind, p).Redirect(t).Query().Get("signup_completed"))
			})
		}
	})

	t.Run("should keep the CLI callback port through the round trip", func(t *testing.T) {
		t.Parallel()
		for _, kind := range providers {
			t.Run(string(kind), func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				p := fixture.NewOAuthPerson(tn, true)

				// Action
				res := fixture.OAuthLogin(t, tn, kind, p, fixture.WithOAuthCallbackPort("5555"))

				// Assert
				loc := res.Redirect(t)
				require.Equal(t, "/login/select-organization", loc.Path)
				require.Equal(t, "5555", loc.Query().Get("callback_port"))
			})
		}
	})
}

func TestOAuth_Google(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse selecting an org with Google SSO enforced for a non-Google session, and allow a Google one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t)
		p := fixture.NewOAuthPerson(tn, true)
		p.Email = alice.Email
		google := sessionFrom(t, tn, fixture.OAuthLogin(t, tn, fixture.OAuthGoogle, p))
		first := selectOrg(t, tn, google, tn.OrgID.String())
		require.Equalf(t, http.StatusOK, first.StatusCode(), "selecting with Google: %s", apierr.Body(first.Body))
		enforced := updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{GoogleSsoAuthEnforced: new(true), BypassOrgAuthEnabled: new(true)})
		require.Equalf(t, http.StatusOK, enforced.StatusCode(), "enforcing Google SSO: %s", apierr.Body(enforced.Body))

		// Action
		password := selectOrg(t, tn, loggedIn(t, tn, alice.Email), tn.OrgID.String())
		googleAgain := selectOrg(t, tn, sessionFrom(t, tn, fixture.OAuthLogin(t, tn, fixture.OAuthGoogle, p)), tn.OrgID.String())

		// Assert
		require.Equal(t, http.StatusForbidden, password.StatusCode())
		require.Contains(t, apierr.Message(password.Body), "Login with Google SSO")
		require.Nil(t, cookieNamed(password.HTTPResponse, "jid"))
		require.Equalf(t, http.StatusOK, googleAgain.StatusCode(), "selecting with Google: %s", apierr.Body(googleAgain.Body))
	})

	t.Run("should leave an invited membership pending after a Google login naming the org, and accept it once the org is selected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		alice := tn.NewUser(t)
		invite(t, other, alice.Email)
		p := fixture.NewOAuthPerson(tn, true)
		p.Email = alice.Email
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGoogle, p, fixture.WithOAuthOrgSlug(other.OrgSlug))
		require.Equal(t, "/login/select-organization", res.Redirect(t).Path)
		require.Equal(t, "invited", fixture.MembershipOf(t, other, alice.Email).Status)
		s := sessionFrom(t, tn, res)

		// Action
		selected, err := s.API.SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: other.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, selected.StatusCode(), "body: %s", apierr.Body(selected.Body))
		require.Equal(t, "accepted", fixture.MembershipOf(t, other, alice.Email).Status)
	})
}

func TestOAuth_NoEmail(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a GitHub login whose account has no email, and answer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		b := fixture.StartOAuth(t, tn, fixture.OAuthGitHub)
		cp := fixture.OAuthConsentGitHub(t, tn, fixture.NewOAuthAccountID())
		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		// Action
		res, err := b.Callback(ctx, fixture.OAuthGitHub, cp.Code, b.State, b.Cookies...)

		// Assert
		require.NoError(t, err, "the callback never answered")
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "No email found for GitHub account", apierr.Message(res.Body))
		require.Nil(t, cookieNamed(res.HTTP, "jid"))
	})

	t.Run("should refuse a GitLab login whose profile has no email, and answer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		b := fixture.StartOAuth(t, tn, fixture.OAuthGitLab)
		cp := fixture.OAuthConsent(t, tn, fixture.OAuthGitLab, fixture.OAuthPerson{ID: fixture.NewOAuthAccountID(), Verified: true})
		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		// Action
		res, err := b.Callback(ctx, fixture.OAuthGitLab, cp.Code, b.State, b.Cookies...)

		// Assert
		require.NoError(t, err, "the callback never answered")
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "No email found for GitLab account", apierr.Message(res.Body))
		require.Nil(t, cookieNamed(res.HTTP, "jid"))
	})

	t.Run("should refuse a Google login whose profile has no email, and answer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		b := fixture.StartOAuth(t, tn, fixture.OAuthGoogle)
		cp := fixture.OAuthConsent(t, tn, fixture.OAuthGoogle, fixture.OAuthPerson{ID: fixture.NewOAuthAccountID(), Verified: true})
		ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
		defer cancel()

		// Action
		res, err := b.Callback(ctx, fixture.OAuthGoogle, cp.Code, b.State, b.Cookies...)

		// Assert
		require.NoError(t, err, "the callback never answered")
		require.Equalf(t, http.StatusNotFound, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Email not found", apierr.Message(res.Body))
		require.Nil(t, cookieNamed(res.HTTP, "jid"))
	})
}
