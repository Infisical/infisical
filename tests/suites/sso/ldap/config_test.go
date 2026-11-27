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
