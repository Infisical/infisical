package oidc_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOIDCEnforcement(t *testing.T) {
	t.Parallel()

	t.Run("should refuse enforcement when nobody has logged in with OIDC yet", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)

		// Action
		res, err := o.Tenant.Admin.API.UpdateOrganizationWithResponse(t.Context(), o.Tenant.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true)})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "please log in via OIDC at least once")
		require.False(t, authEnforced(t, o.Tenant))
	})

	t.Run("should enable enforcement when an OIDC login has succeeded", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		signedUp(t, o)

		// Action
		res, err := o.Tenant.Admin.API.UpdateOrganizationWithResponse(t.Context(), o.Tenant.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true), BypassOrgAuthEnabled: new(true)})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, authEnforced(t, o.Tenant))
	})

	t.Run("should block org resources when a password session is used under enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		member := o.Tenant.NewUser(t)
		enforce(t, o)

		// Action
		res, err := member.API.GetOrganizationByIdWithResponse(t.Context(), o.Tenant.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "Organization authentication is enforced")
	})

	t.Run("should refuse org selection when a password user logs in under enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		member := o.Tenant.NewUser(t)
		enforce(t, o)
		login, err := o.Tenant.Anonymous(t).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
			Email:    member.Email,
			Password: harness.UserPassword,
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, login.StatusCode(), "password login: %s", apierr.Body(login.Body))

		// Action
		res, err := o.Tenant.Client(t, login.JSON200.AccessToken).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: o.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Contains(t, string(res.Body), "Organization authentication is enforced")
	})

	t.Run("should allow org resources when the session came from OIDC", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		alice := signedUp(t, o)
		sso.Enforce(t, o.Tenant)
		session := o.Session(t, o.Login(t, alice))

		// Action
		res, err := session.GetOrganizationByIdWithResponse(t.Context(), o.Tenant.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
	})
}
