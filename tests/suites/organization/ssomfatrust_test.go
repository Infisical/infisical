package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOrganization_SsoMfaTrust(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store the trust when MFA is not enforced yet", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := trustIdP(t, tn, tn.Admin)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "signal", orgOf(t, tn).SsoMfaTrust)
	})

	t.Run("should refuse the trust and keep none when the plan does not include MFA enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.EnforceMFA)))

		// Action
		res := trustIdP(t, tn, tn.Admin)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to update MFA for SSO logins due to plan restriction. Upgrade plan to trust identity provider MFA.",
			apierr.Message(res.Body))
		require.Equal(t, "none", orgOf(t, tn).SsoMfaTrust)
	})

	t.Run("should refuse a member who can edit settings but not SSO, and keep none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		editor := customRoleUser(t, tn, "settings-editor",
			fixture.Permission{Subject: "settings", Action: []string{"read", "edit"}})

		// Action
		res := trustIdP(t, tn, editor)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to edit on sso", apierr.Message(res.Body))
		require.Equal(t, "none", orgOf(t, tn).SsoMfaTrust)
	})
}

func trustIdP(t *testing.T, tn *harness.Tenant, actor *harness.Principal) *api.UpdateOrganizationResponse {
	t.Helper()
	res, err := fresh(t, tn, actor).UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{SsoMfaTrust: new(api.Signal)})
	require.NoError(t, err)
	return res
}
