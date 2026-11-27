package organization_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOrganization_SsoSettings(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should allow a member who can edit SSO but not settings", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		editor := customRoleUser(t, tn, "sso-editor",
			fixture.Permission{Subject: "sso", Action: []string{"read", "edit"}})

		// Action
		res := updateSsoSettings(t, tn, editor, api.UpdateOrganizationSsoSettingsJSONRequestBody{BypassOrgAuthEnabled: new(true)})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.True(t, res.JSON200.SsoSettings.BypassOrgAuthEnabled)
	})

	t.Run("should refuse a sub-organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res := updateSsoSettings(t, tn, sub.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{BypassOrgAuthEnabled: new(true)})

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Child organization cannot do this operation")
	})

	t.Run("should refuse SSO enforcement when the plan has neither SAML nor OIDC", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SAMLSSO, license.OIDCSSO)))

		// Action
		res := updateSsoSettings(t, tn, tn.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{AuthEnforced: new(true)})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to enforce SSO due to plan restriction. Upgrade plan to enforce SSO.", apierr.Message(res.Body))
	})

	t.Run("should allow turning SSO enforcement off when the plan has neither SAML nor OIDC", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SAMLSSO, license.OIDCSSO)))

		// Action
		res := updateSsoSettings(t, tn, tn.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{AuthEnforced: new(false)})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.False(t, res.JSON200.SsoSettings.AuthEnforced)
	})

	t.Run("should refuse SSO enforcement without an active SAML or OIDC configuration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := updateSsoSettings(t, tn, tn.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{AuthEnforced: new(true)})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Cannot enforce SSO because the organization has no active SAML or OIDC configuration.",
			apierr.Message(res.Body))
		require.False(t, orgOf(t, tn).AuthEnforced)
	})

	t.Run("should refuse Google enforcement while OIDC is configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewOIDC(t, tn)

		// Action
		res := updateSsoSettings(t, tn, tn.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{GoogleSsoAuthEnforced: new(true)})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Cannot enable Google OAuth enforcement while OIDC SSO is configured")
		require.False(t, orgOf(t, tn).GoogleSsoAuthEnforced)
	})

	t.Run("should refuse Google enforcement before anyone has logged in with Google", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := updateSsoSettings(t, tn, tn.Admin, api.UpdateOrganizationSsoSettingsJSONRequestBody{GoogleSsoAuthEnforced: new(true)})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Google SSO has not been used yet")
		require.False(t, orgOf(t, tn).GoogleSsoAuthEnforced)
	})

	t.Run("should not change SSO settings through the generic organization update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := fresh(t, tn, tn.Admin).UpdateOrganizationWithBodyWithResponse(t.Context(), tn.OrgID.String(),
			"application/json", bytes.NewReader([]byte(`{"name":"renamed","ssoMfaTrust":"signal","bypassOrgAuthEnabled":true}`)))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		settings, err := fresh(t, tn, tn.Admin).GetOrganizationSsoSettingsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, settings.StatusCode(), settings.Body)
		require.Equal(t, "none", string(settings.JSON200.SsoSettings.SsoMfaTrust))
		require.False(t, settings.JSON200.SsoSettings.BypassOrgAuthEnabled)
	})
}

func updateSsoSettings(t *testing.T, tn *harness.Tenant, actor *harness.Principal, body api.UpdateOrganizationSsoSettingsJSONRequestBody) *api.UpdateOrganizationSsoSettingsResponse {
	t.Helper()
	res, err := fresh(t, tn, actor).UpdateOrganizationSsoSettingsWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}
