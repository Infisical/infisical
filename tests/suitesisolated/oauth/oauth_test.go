package oauth_test

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOAuth_InstanceSignup(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse signup by OAuth when signups are disabled, and create no account", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		configure(t, tn, `{"allowSignUp": false}`, `{"allowSignUp": true}`)
		p := fixture.NewOAuthPerson(tn, true)

		// Action
		res := fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.Status, "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Sign up disabled", apierr.Message(res.Body))
		require.Nil(t, refreshCookie(res))
		configure(t, tn, `{"allowSignUp": true}`, `{"allowSignUp": true}`)
		require.Equal(t, "true", fixture.OAuthLogin(t, tn, fixture.OAuthGitHub, p).Redirect(t).Query().Get("signup_completed"))
	})

	t.Run("should refuse signup by OAuth when the email domain is not allowed", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		configure(t, tn, `{"allowedSignUpDomain": "allowed.test"}`, `{"allowedSignUpDomain": null}`)
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
		disableGitHub(t, tn)
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
		disableGitHub(t, tn)
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
func configure(t *testing.T, tn *harness.Tenant, set, restore string) {
	t.Helper()
	admin := serverAdminUser(t, tn)
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

// serverAdminUser is the instance's root user, from the tenant's address, with a session in its own organization.
// Granting server admin to another user is an instance plan feature this instance does
// not have, so the root is the only user who can write the configuration.
func serverAdminUser(t *testing.T, tn *harness.Tenant) *harness.Principal {
	t.Helper()
	login, err := tn.Anonymous(t).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email:    infisical.RootEmail,
		Password: infisical.RootPassword,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, login.StatusCode(), "logging in as the root: %s", apierr.Body(login.Body))
	unscoped := tn.Client(t, login.JSON200.AccessToken)
	orgs, err := unscoped.ListOrganizationsWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, orgs.StatusCode(), "listing the root's organizations: %s", apierr.Body(orgs.Body))
	require.NotEmpty(t, orgs.JSON200.Organizations)
	selected, err := unscoped.SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgs.JSON200.Organizations[0].Id.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, selected.StatusCode(), "selecting the root's organization: %s", apierr.Body(selected.Body))
	return &harness.Principal{Kind: harness.User, Email: infisical.RootEmail, Token: selected.JSON200.Token,
		API: tn.Client(t, selected.JSON200.Token)}
}

func disableGitHub(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	configure(t, tn,
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
