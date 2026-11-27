package ldap_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/ldap"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestLDAPConfig_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store the directory settings when an admin creates a config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, tn)
		d := newDirectory(t, tn)

		// Action
		res := createConfig(t, tn.Admin.API, d.configBody())

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		stored := storedConfig(t, tn)
		require.NotNilf(t, stored.JSON200, "reading the config: %s", apierr.Body(stored.Body))
		require.Equal(t, ldap.Service.URL(), stored.JSON200.Url)
		require.Equal(t, d.BindDN, stored.JSON200.BindDN)
		require.Equal(t, "ou=people,"+d.BaseDN, stored.JSON200.SearchBase)
		require.True(t, stored.JSON200.IsActive)
	})

	t.Run("should refuse creation and store nothing when the plan does not include ldap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.LDAP)))
		d := newDirectory(t, tn)

		// Action
		res := createConfig(t, tn.Admin.API, d.configBody())

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "plan restriction")
		require.Nil(t, storedConfig(t, tn).JSON200)
	})

	t.Run("should refuse creation and store nothing when the organization has no verified email domain", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := newDirectory(t, tn)

		// Action
		res := createConfig(t, tn.Admin.API, d.configBody())

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON400)
		require.Equal(t, "SSO_EMAIL_DOMAIN_NOT_VERIFIED", res.JSON400.Error)
		require.Nil(t, storedConfig(t, tn).JSON200)
	})

	t.Run("should refuse creation and store nothing when a member creates a config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := newDirectory(t, tn)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res := createConfig(t, member.API, d.configBody())

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Nil(t, storedConfig(t, tn).JSON200)
	})
}

func TestLDAPConnection(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report a working connection when the bind credentials are right", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := newDirectory(t, tn)

		// Action
		res, err := tn.Admin.API.TestLdapConnectionWithResponse(t.Context(), api.TestLdapConnectionJSONRequestBody{
			Url: ldap.Service.URL(), BindDN: d.BindDN, BindPass: d.BindPassword,
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.True(t, *res.JSON200)
	})

	t.Run("should report a failed connection when the bind password is wrong", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := newDirectory(t, tn)

		// Action
		res, err := tn.Admin.API.TestLdapConnectionWithResponse(t.Context(), api.TestLdapConnectionJSONRequestBody{
			Url: ldap.Service.URL(), BindDN: d.BindDN, BindPass: "not-the-password",
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.False(t, *res.JSON200)
	})
}

func TestLDAPConfig_OneSsoMethod(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an LDAP config while the organization has a SAML config and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewSAML(t, tn, sso.Okta)
		d := newDirectory(t, tn)

		// Action
		res := createConfig(t, tn.Admin.API, d.configBody())

		// Assert
		require.Equalf(t, http.StatusConflict, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "already has SAML configured")
		require.Equal(t, http.StatusNotFound, storedConfig(t, tn).StatusCode())
	})

	t.Run("should refuse a SAML config while the organization has an LDAP config and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusConflict, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "already has LDAP configured")
		saml, err := tn.Admin.API.GetSamlConfigWithResponse(t.Context())
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, saml.StatusCode())
	})
}

func TestLDAPConfig_LegacyPath(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the same config on the legacy path as on the new path", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)

		// Action
		current := storedConfig(t, tn)
		legacy, err := tn.Admin.API.GetLdapConfigWithResponse(t.Context(), legacyPath)
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusOK, current.StatusCode(), current.Body)
		requireStatus(t, http.StatusOK, legacy.StatusCode(), legacy.Body)
		require.JSONEq(t, string(current.Body), string(legacy.Body))
	})

	t.Run("should create a config on the legacy path when the body still sends organizationId", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, tn)
		d := newDirectory(t, tn)

		// Action
		res, err := tn.Admin.API.CreateLdapConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, d.configBody(), tn.OrgID.String()), legacyPath)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		stored := storedConfig(t, tn)
		require.NotNilf(t, stored.JSON200, "reading the config: %s", apierr.Body(stored.Body))
		require.Equal(t, d.BindDN, stored.JSON200.BindDN)
	})

	t.Run("should update a config on the legacy path when the body still sends organizationId", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)
		filter := "(cn={{username}})"

		// Action
		res, err := tn.Admin.API.UpdateLdapConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, api.UpdateLdapConfigJSONRequestBody{SearchFilter: new(filter)}, tn.OrgID.String()), legacyPath)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		stored := storedConfig(t, tn)
		require.NotNilf(t, stored.JSON200, "reading the config: %s", apierr.Body(stored.Body))
		require.Equal(t, filter, stored.JSON200.SearchFilter)
	})

	t.Run("should act on the token's organization when a legacy body names another organization", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The organization now comes from the token. A legacy caller's organizationId is ignored, "+
			"so naming another organization can neither read nor change that organization's config.")

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, theirs)
		d := newDirectory(t, theirs)

		// Action
		res, err := theirs.Admin.API.CreateLdapConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, d.configBody(), mine.OrgID.String()), legacyPath)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, theirs.OrgID, res.JSON200.OrgId)
		require.Nil(t, storedConfig(t, mine).JSON200)
	})
}

func TestLDAPConfig_StatusCodes(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a second config with a conflict and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		second := d.configBody()
		second.SearchBase = "ou=other," + d.BaseDN

		// Action
		res := createConfig(t, tn.Admin.API, second)

		// Assert
		requireStatus(t, http.StatusConflict, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "already exists")
		require.Equal(t, "ou=people,"+d.BaseDN, storedConfig(t, tn).JSON200.SearchBase)
	})

	t.Run("should answer not found when updating a config that does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateLdapConfigWithResponse(t.Context(), api.UpdateLdapConfigJSONRequestBody{IsActive: new(false)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
	})

	t.Run("should answer not found when deleting a group mapping that does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)
		configID := storedConfig(t, tn).JSON200.Id

		// Action
		res, err := tn.Admin.API.DeleteLdapGroupMapWithResponse(t.Context(), configID, "7c1f0c58-6f0e-4d57-9a55-3a1d3f6f9b11")

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
	})
}

func TestLDAPConfig_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the config and allow a new one when an admin deletes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		configID := storedConfig(t, tn).JSON200.Id

		// Action
		res, err := tn.Admin.API.DeleteLdapConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, configID, res.JSON200.Id.String())
		requireStatus(t, http.StatusNotFound, storedConfig(t, tn).StatusCode(), nil)
		recreated := createConfig(t, tn.Admin.API, d.configBody())
		requireStatus(t, http.StatusOK, recreated.StatusCode(), recreated.Body)
	})

	t.Run("should return not found when the organization has no config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.DeleteLdapConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "LDAP configuration for organization")
	})

	t.Run("should reject the delete and keep the config when the actor is a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.DeleteLdapConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotNil(t, storedConfig(t, tn).JSON200)
	})

	t.Run("should remove the config when a machine identity with the admin role deletes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		res, err := identity.API.DeleteLdapConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, storedConfig(t, tn).JSON200)
	})

	t.Run("should not serve delete on the legacy path and keep the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		configured(t, tn)

		// Action
		res, err := tn.Admin.API.DeleteLdapConfigWithResponse(t.Context(), legacyPath)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.NotNil(t, storedConfig(t, tn).JSON200)
	})
}
