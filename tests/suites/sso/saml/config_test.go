package saml_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSAMLConfig_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store the IdP settings when an admin creates a config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), "BEGIN CERTIFICATE")
		stored := readConfig(t, tn, tn.Admin)
		require.Equal(t, body.EntryPoint, stored.EntryPoint)
		require.Equal(t, body.Issuer, stored.Issuer)
		require.Equal(t, strings.TrimSpace(body.Cert), stored.Cert)
		require.True(t, stored.IsActive)
	})

	t.Run("should reject creation when the plan lacks SAML SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SAMLSSO)))

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "due to plan restriction")
		requireNoConfig(t, tn)
	})

	t.Run("should reject creation when the actor is a member without SSO permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)

		// Action
		res, err := member.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta))

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
		res, err := theirs.Admin.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(mine, samlidp.New(t), sso.Okta))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		requireNoConfig(t, mine)
	})

	t.Run("should reject group sync when the provider is not Google", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)
		body.EnableGroupSync = new(true)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Group sync is not supported for this SAML provider.")
		requireNoConfig(t, tn)
	})
}

func TestSAMLConfig_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return not found when the organization has no config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetSamlConfigWithResponse(t.Context(), &api.GetSamlConfigParams{OrganizationId: tn.OrgID.String()})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, string(res.Body), "SAML configuration for organization with ID '"+tn.OrgID.String()+"' not found")
	})

	t.Run("should return the config when a machine identity has SSO read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)
		sso.CreateSAMLConfig(t, tn, body)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		stored := readConfig(t, tn, identity)

		// Assert
		require.Equal(t, body.EntryPoint, stored.EntryPoint)
	})
}

func TestSAMLConfig_Update(t *testing.T) {
	t.Parallel()

	t.Run("should apply new IdP settings when an admin updates the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		replacement := samlidp.New(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.Tenant.OrgID.String(),
			EntryPoint:     new(replacement.EntryPoint),
			Cert:           new(replacement.CertPEM()),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		stored := readConfig(t, s.Tenant, s.Tenant.Admin)
		require.Equal(t, replacement.EntryPoint, stored.EntryPoint)
		require.Equal(t, strings.TrimSpace(replacement.CertPEM()), stored.Cert)
		require.Equal(t, s.Issuer, stored.Issuer)
	})

	t.Run("should turn off SSO enforcement when the config is updated", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Pins current behaviour: every config update clears authEnforced and lastUsed, "+
			"so an admin who rotates a certificate silently drops SSO enforcement.")

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.Tenant.OrgID.String(),
			Cert:           new(s.IdP.CertPEM()),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		org, err := s.Tenant.Admin.API.GetOrganizationByIdWithResponse(t.Context(), s.Tenant.OrgID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, org.StatusCode(), "%s", apierr.Body(org.Body))
		require.False(t, *org.JSON200.Organization.AuthEnforced)
	})
}

type storedConfig struct {
	EntryPoint, Issuer, Cert string
	IsActive                 bool
}

func readConfig(t *testing.T, tn *harness.Tenant, actor *harness.Principal) storedConfig {
	t.Helper()
	res, err := actor.API.GetSamlConfigWithResponse(t.Context(), &api.GetSamlConfigParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading SAML config: %s", apierr.Body(res.Body))
	return storedConfig{
		EntryPoint: res.JSON200.EntryPoint,
		Issuer:     res.JSON200.Issuer,
		Cert:       res.JSON200.Cert,
		IsActive:   res.JSON200.IsActive,
	}
}

func requireNoConfig(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.GetSamlConfigWithResponse(t.Context(), &api.GetSamlConfigParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusNotFound, res.StatusCode(), "a SAML config exists: %s", apierr.Body(res.Body))
}
