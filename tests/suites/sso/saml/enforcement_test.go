package saml_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSAMLEnforcement(t *testing.T) {
	t.Parallel()

	t.Run("should refuse enforcement when nobody has logged in with SAML yet", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		res, err := s.Tenant.Admin.API.UpdateOrganizationWithResponse(t.Context(), s.Tenant.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true)})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "please log in via SAML at least once")
		require.False(t, authEnforced(t, s.Tenant))
	})

	t.Run("should enable enforcement when a SAML login has succeeded", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		s.SignedUp(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateOrganizationWithResponse(t.Context(), s.Tenant.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true), BypassOrgAuthEnabled: new(true)})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, authEnforced(t, s.Tenant))
	})

	t.Run("should block org resources when a password session is used under enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		member := s.Tenant.NewUser(t)
		s.Enforce(t)

		// Action
		res, err := member.API.GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "Organization authentication is enforced")
	})

	t.Run("should refuse org selection when a password user logs in under enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		member := s.Tenant.NewUser(t)
		s.Enforce(t)
		login, err := s.Tenant.Anonymous(t).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
			Email:    member.Email,
			Password: harness.UserPassword,
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, login.StatusCode(), "password login: %s", apierr.Body(login.Body))

		// Action
		res, err := s.Tenant.Client(t, login.JSON200.AccessToken).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Organization authentication is enforced")
	})

	t.Run("should let an admin through and notify admins when bypass is enabled", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		otherAdmin := s.Tenant.NewUser(t, harness.OrgRole("admin"))
		s.Enforce(t)

		// Action
		res, err := s.Tenant.Admin.API.SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		alert := s.Tenant.Mail(t).Expect(t, otherAdmin.Email, smtp.Subject("SSO Bypass"))
		require.Contains(t, alert.Body, s.Tenant.Admin.Email)
	})

	t.Run("should allow org resources when the session came from SAML", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		alice := s.SignedUp(t)
		s.Enforce(t)
		session := s.Session(t, s.SPLogin(t, alice))

		// Action
		res, err := session.GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
	})
}

func authEnforced(t *testing.T, tn *harness.Tenant) bool {
	t.Helper()
	res, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the org: %s", apierr.Body(res.Body))
	return res.JSON200.Organization.AuthEnforced != nil && *res.JSON200.Organization.AuthEnforced
}
