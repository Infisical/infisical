package isolated_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOAuth_InstanceSignup(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse signup by OAuth when signups are disabled, and create no account", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		configure(t, h, `{"allowSignUp": false}`, `{"allowSignUp": true}`)
		p := fixture.NewOAuthPerson(tn, true)

		// Action
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Sign up disabled", apierr.Message(res.Body))
		require.Nil(t, refreshCookie(res))
		configure(t, h, `{"allowSignUp": true}`, `{"allowSignUp": true}`)
		require.Equal(t, "true", fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p).Redirect(t).Query().Get("signup_completed"))
	})

	t.Run("should refuse signup by OAuth when the email domain is not allowed", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		configure(t, h, `{"allowedSignUpDomain": "allowed.test"}`, `{"allowedSignUpDomain": null}`)
		p := fixture.NewOAuthPerson(tn, true)
		domain := strings.SplitN(p.Email, "@", 2)[1]

		// Action
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGitLab, p)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Email with a domain (@"+domain+") is not supported", apierr.Message(res.Body))
		require.Nil(t, refreshCookie(res))
	})
}

func TestOAuth_DisabledProvider(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse a provider the admin disabled", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)
		disableGitHub(t, h)
		p := fixture.NewOAuthPerson(tn, true)
		p.Email = member.Email

		// Action
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Login with Github is disabled by administrator.", apierr.Message(res.Body))
		require.Nil(t, refreshCookie(res))
		me, err := member.API.GetCurrentUserWithResponse(t.Context())
		require.NoError(t, err)
		require.Equal(t, []string{"email"}, *me.JSON200.User.AuthMethods)
	})

	t.Run("should let an org admin log in with a provider the admin disabled", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		disableGitHub(t, h)
		p := fixture.NewOAuthPerson(tn, true)
		p.Email = tn.Admin.Email

		// Action
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p)

		// Assert
		require.Equal(t, "/login/select-organization", res.Redirect(t).Path)
		require.NotNil(t, refreshCookie(res))
	})
}

// configure writes instance configuration as raw JSON, since the typed body cannot send
// null, and restores it when the test ends.
//
// A user writes it rather than h.InstanceAdmin: updateServerCfg reads the caller as a
// user to check it keeps a login method, and answers 500 for the bootstrap identity.
func configure(t *testing.T, h *harness.Stack, set, restore string) {
	t.Helper()
	admin := serverAdminUser(t, h)
	write := func(ctx context.Context, body string) *api.UpdateAdminConfigResponse {
		res, err := admin.API.UpdateAdminConfigWithBodyWithResponse(ctx, "application/json", bytes.NewReader([]byte(body)))
		require.NoError(t, err)
		return res
	}
	res := write(t.Context(), set)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "configuring the instance: %s", apierr.Body(res.Body))
	t.Cleanup(func() {
		// t.Context is already cancelled when cleanups run.
		res := write(context.Background(), restore)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "restoring the instance: %s", apierr.Body(res.Body))
	})
}

// serverAdminUser is a user, outside the tenant under test, promoted to server admin.
func serverAdminUser(t *testing.T, h *harness.Stack) *harness.Principal {
	t.Helper()
	ops := h.NewTenant(t).Admin
	res, err := h.InstanceAdmin(t).API.GrantAdminAccessToUserWithResponse(t.Context(), ops.ID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "granting server admin: %s", apierr.Body(res.Body))
	return ops
}

func disableGitHub(t *testing.T, h *harness.Stack) {
	t.Helper()
	configure(t, h,
		`{"enabledLoginMethods": ["email", "google", "gitlab", "saml", "oidc", "ldap"]}`,
		`{"enabledLoginMethods": ["email", "google", "github", "gitlab", "saml", "oidc", "ldap"]}`)
}

func refreshCookie(res fixture.OAuthResult) *http.Cookie {
	for _, c := range res.HTTP.Cookies() {
		if c.Name == "jid" {
			return c
		}
	}
	return nil
}
