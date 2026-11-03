package oidc_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

var customMFAClaim = api.UpdateOidcConfigJSONRequestBody{MfaClaimName: new("auth_methods"), MfaAmrValues: &[]string{"otp"}}

func TestOIDCMFATrust(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		config     *api.UpdateOidcConfigJSONRequestBody
		claims     map[string]any
		challenged bool
	}{
		{
			name:   "should skip the MFA challenge when the amr claim lists mfa",
			claims: map[string]any{"amr": []string{"pwd", "mfa"}},
		},
		{
			name:       "should challenge when the amr claim lists a password only",
			claims:     map[string]any{"amr": []string{"pwd"}},
			challenged: true,
		},
		{
			name:   "should skip the MFA challenge when the claim the config names lists a value it accepts",
			config: &customMFAClaim,
			claims: map[string]any{"auth_methods": []string{"pwd", "otp"}},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			o := setup(t)
			alice := signedUp(t, o)
			sso.EnforceMFA(t, o.Tenant, api.Signal)
			if c.config != nil {
				updateConfig(t, o, *c.config)
			}
			alice.Claims = c.claims

			// Action
			res := selectAfterLogin(t, o, alice)

			// Assert
			require.Equal(t, c.challenged, res.JSON200.IsMfaEnabled)
			if !c.challenged {
				require.Equal(t, http.StatusOK, readOrg(t, o.Tenant.Client(t, res.JSON200.Token), o.Tenant))
			}
		})
	}

	t.Run("should keep SSO enforced when an update changes only the MFA claim fields", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		enforce(t, o)

		// Action
		updateConfig(t, o, customMFAClaim)

		// Assert
		require.True(t, authEnforced(t, o.Tenant))
	})
}

func selectAfterLogin(t *testing.T, o *sso.OIDC, p oidcidp.Person) *api.SelectOrganizationV3Response {
	t.Helper()
	login := o.Login(t, p)
	o.Redirect(t, login)
	res := sso.SelectOrganization(t, o.Tenant, login.HTTPResponse, o.Tenant.OrgID.String())
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting the organization: %s", apierr.Body(res.Body))
	return res
}

func updateConfig(t *testing.T, o *sso.OIDC, body api.UpdateOidcConfigJSONRequestBody) {
	t.Helper()
	body.OrganizationId = o.Tenant.OrgID.String()
	res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the OIDC config: %s", apierr.Body(res.Body))
}
