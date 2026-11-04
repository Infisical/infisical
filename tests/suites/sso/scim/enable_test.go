package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

const scimDisabled = "SCIM is disabled for the organization"

func TestScimEnable(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse enabling SCIM when neither SAML nor OIDC is configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		r := setScimEnabled(t, tn, true)

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "Cannot enable SCIM when neither SAML or OIDC is configured")
		require.False(t, scimEnabled(t, tn))
	})

	t.Run("should refuse enabling SCIM when the plan does not include it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SCIM)))
		sso.NewSAML(t, tn, sso.Okta)

		// Action
		r := setScimEnabled(t, tn, true)

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "Upgrade plan to enable/disable SCIM provisioning")
		require.False(t, scimEnabled(t, tn))
	})

	t.Run("should enable SCIM when OIDC is the org's SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewOIDC(t, tn)

		// Action
		r := setScimEnabled(t, tn, true)

		// Assert
		requireOK(t, r, "enabling SCIM")
		require.True(t, scimEnabled(t, tn))
	})
}

func TestScimDisabled(t *testing.T) {
	t.Parallel()

	t.Run("should refuse to provision and add nobody when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")
		p := s.person()

		// Action
		r := s.createUser(t, userBody(p))

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.Equal(t, scimDisabled, errorText(t, r))
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse to list users when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")

		// Action
		r := s.listUsers(t, api.ListScimUsersParams{})

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.Equal(t, scimDisabled, errorText(t, r))
	})

	t.Run("should refuse to deactivate and leave the member active when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should refuse to remove and keep the member when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")

		// Action
		r := s.deleteUser(t, user.ID)

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.NotNil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse group pushes when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")

		// Action
		r := s.createGroup(t, "engineering")

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
		require.Equal(t, scimDisabled, errorText(t, r))
	})

	t.Run("should refuse to read a group when SCIM is switched off", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		g := s.provisionGroup(t, "engineering")
		requireOK(t, setScimEnabled(t, s.tn, false), "disabling SCIM")

		// Action
		r := s.getGroup(t, g.ID, nil)

		// Assert
		require.Equal(t, http.StatusForbidden, r.status)
	})
}

func TestScimSSOConfigChange(t *testing.T) {
	t.Parallel()

	t.Run("should switch SCIM off when the SAML config is edited", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		res, err := s.tn.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.tn.OrgID.String(),
			Issuer:         new(s.saml.Issuer + "-rotated"),
		})

		// Assert
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "editing the SAML config")
		require.False(t, scimEnabled(t, s.tn))
		require.Equal(t, http.StatusForbidden, s.listUsers(t, api.ListScimUsersParams{}).status)
	})

	t.Run("should resume provisioning with the same token when SCIM is switched back on", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		res, err := s.tn.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.tn.OrgID.String(),
			Issuer:         new(s.saml.Issuer + "-rotated"),
		})
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "editing the SAML config")

		// Action
		r := setScimEnabled(t, s.tn, true)

		// Assert
		requireOK(t, r, "re-enabling SCIM")
		requireOK(t, s.listUsers(t, api.ListScimUsersParams{}), "listing users after re-enabling")
	})

	t.Run("should switch SCIM off when the OIDC config is edited", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setupWith(t, viaOIDC, harness.From(t).NewTenant(t))

		// Action
		res, err := s.tn.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId:      s.tn.OrgID.String(),
			AllowedEmailDomains: new(""),
		})

		// Assert
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "editing the OIDC config")
		require.False(t, scimEnabled(t, s.tn))
	})

	t.Run("should refuse to update a user and keep them active when the SAML config is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		res, err := s.tn.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.tn.OrgID.String(),
			IsActive:       new(false),
		})
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "deactivating the SAML config")

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "Neither SAML or OIDC SSO is configured", errorText(t, r))
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})
}
