package oidc_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestOIDCConfig_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store the provider settings without echoing the secret when an admin creates a config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := configBody(t, tn)

		// Action
		res, err := tn.Admin.API.CreateOidcConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), body.ClientSecret)
		stored := readConfig(t, tn, tn.Admin)
		require.Equal(t, *body.DiscoveryURL, *stored.DiscoveryURL)
		require.Equal(t, "discoveryURL", stored.ConfigurationType)
		require.Equal(t, body.ClientId, stored.ClientId)
		require.Equal(t, body.ClientSecret, stored.ClientSecret)
		require.True(t, stored.IsActive)
	})

	t.Run("should reject creation when the plan lacks OIDC SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.OIDCSSO)))

		// Action
		res, err := tn.Admin.API.CreateOidcConfigWithResponse(t.Context(), configBody(t, tn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Failed to create OIDC SSO configuration due to plan restriction")
		requireNoConfig(t, tn)
	})

	t.Run("should reject creation when the actor is a member without SSO permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)

		// Action
		res, err := member.API.CreateOidcConfigWithResponse(t.Context(), configBody(t, tn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		requireNoConfig(t, tn)
	})

	t.Run("should reject creation when the admin belongs to another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)

		// Action
		res, err := theirs.Admin.API.CreateOidcConfigWithResponse(t.Context(), configBody(t, mine))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		requireNoConfig(t, mine)
	})

	t.Run("should reject a discovery config that has no discovery URL", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := configBody(t, tn)
		body.DiscoveryURL = nil

		// Action
		res, err := tn.Admin.API.CreateOidcConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), "Discovery URL is required")
		requireNoConfig(t, tn)
	})
}

func TestOIDCConfig_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return not found when the organization has no config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetOidcConfigWithResponse(t.Context(), &api.GetOidcConfigParams{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, string(res.Body), "Failed to find OIDC SSO data")
	})

	t.Run("should refuse the config, which carries the client secret, when the actor is a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		member := o.Tenant.NewUser(t)

		// Action
		res, err := member.API.GetOidcConfigWithResponse(t.Context(), &api.GetOidcConfigParams{OrganizationId: o.Tenant.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Nil(t, res.JSON200)
	})

	t.Run("should return the config when a machine identity has SSO read", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		identity := o.Tenant.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		stored := readConfig(t, o.Tenant, identity)

		// Assert
		require.Equal(t, o.OP.DiscoveryURL()+"/.well-known/openid-configuration", *stored.DiscoveryURL)
	})
}

func TestOIDCConfig_Update(t *testing.T) {
	t.Parallel()

	t.Run("should apply new provider settings when an admin updates the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		replacement := configBody(t, o.Tenant)

		// Action
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId:      o.Tenant.OrgID.String(),
			DiscoveryURL:        replacement.DiscoveryURL,
			ClientId:            new(replacement.ClientId),
			ClientSecret:        new(replacement.ClientSecret),
			AllowedEmailDomains: new("a.test,b.test"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		stored := readConfig(t, o.Tenant, o.Tenant.Admin)
		require.Equal(t, *replacement.DiscoveryURL, *stored.DiscoveryURL)
		require.Equal(t, replacement.ClientId, stored.ClientId)
		require.Equal(t, replacement.ClientSecret, stored.ClientSecret)
		require.Equal(t, "a.test, b.test", *stored.AllowedEmailDomains)
	})

	t.Run("should reject an update and keep the config when the plan no longer includes OIDC SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		o.Tenant.SetPlan(t, license.Enterprise().Without(license.OIDCSSO))

		// Action
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId:      o.Tenant.OrgID.String(),
			AllowedEmailDomains: new("other.test"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Failed to update OIDC SSO configuration due to plan restriction")
		require.Empty(t, *readConfig(t, o.Tenant, o.Tenant.Admin).AllowedEmailDomains)
	})

	t.Run("should reject an update and keep the config when the actor is a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		member := o.Tenant.NewUser(t)

		// Action
		res, err := member.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId: o.Tenant.OrgID.String(),
			IsActive:       new(false),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.True(t, readConfig(t, o.Tenant, o.Tenant.Admin).IsActive)
	})

	t.Run("should refuse to start a login when the config is deactivated", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId: o.Tenant.OrgID.String(),
			IsActive:       new(false),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))

		// Action
		start, err := o.Browser.RedirectOidcLoginWithResponse(t.Context(), &api.RedirectOidcLoginParams{OrgSlug: new(o.Tenant.OrgSlug)})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, start.StatusCode())
		require.Contains(t, string(start.Body), "Failed to authenticate with OIDC SSO")
	})

	t.Run("should turn off SSO enforcement when the config is updated", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Pins current behaviour: every config update clears authEnforced and lastUsed, "+
			"so an admin who rotates a client secret silently drops SSO enforcement.")

		// Setup
		o := setup(t)
		enforce(t, o)

		// Action
		res, err := o.Tenant.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
			OrganizationId: o.Tenant.OrgID.String(),
			ClientSecret:   new(id.Short()),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.False(t, authEnforced(t, o.Tenant))
	})
}

// configBody points a config at a new provider in fakenet that knows the client.
func configBody(t *testing.T, tn *harness.Tenant) api.CreateOidcConfigJSONRequestBody {
	t.Helper()
	scope := "t-" + id.Short()
	clientID, secret := "infisical-"+id.Short(), id.Short()+id.Short()
	op := oidcidp.Open(t, fixture.FakenetAdmin(t, tn), scope)
	op.Seed(t, oidcidp.Client(clientID, secret))
	return api.CreateOidcConfigJSONRequestBody{
		OrganizationId:    tn.OrgID.String(),
		ConfigurationType: api.CreateOidcConfigJSONBodyConfigurationTypeDiscoveryURL,
		DiscoveryURL:      new(op.DiscoveryURL() + "/.well-known/openid-configuration"),
		ClientId:          clientID,
		ClientSecret:      secret,
		IsActive:          true,
	}
}

type storedConfig struct {
	DiscoveryURL, AllowedEmailDomains *string
	ConfigurationType                 string
	ClientId, ClientSecret            string
	IsActive                          bool
}

func readConfig(t *testing.T, tn *harness.Tenant, actor *harness.Principal) storedConfig {
	t.Helper()
	res, err := actor.API.GetOidcConfigWithResponse(t.Context(), &api.GetOidcConfigParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading OIDC config: %s", apierr.Body(res.Body))
	empty := ""
	if res.JSON200.AllowedEmailDomains == nil {
		res.JSON200.AllowedEmailDomains = &empty
	}
	return storedConfig{
		DiscoveryURL:        res.JSON200.DiscoveryURL,
		AllowedEmailDomains: res.JSON200.AllowedEmailDomains,
		ConfigurationType:   res.JSON200.ConfigurationType,
		ClientId:            res.JSON200.ClientId,
		ClientSecret:        res.JSON200.ClientSecret,
		IsActive:            res.JSON200.IsActive,
	}
}

func requireNoConfig(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.GetOidcConfigWithResponse(t.Context(), &api.GetOidcConfigParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusNotFound, res.StatusCode(), "an OIDC config exists: %s", apierr.Body(res.Body))
}
