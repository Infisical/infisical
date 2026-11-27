package saml_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fixture"
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
		fixture.VerifiedEmailDomain(t, tn)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), "BEGIN CERTIFICATE")
		stored := readConfig(t, tn.Admin)
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

	t.Run("should reject creation when the organization has no verified email domain", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotNil(t, res.JSON400)
		require.Equal(t, "SSO_EMAIL_DOMAIN_NOT_VERIFIED", res.JSON400.Error)
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
		fixture.VerifiedEmailDomain(t, tn)
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
		res, err := tn.Admin.API.GetSamlConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, string(res.Body), "SAML configuration for organization with ID '"+tn.OrgID.String()+"' not found")
	})

	t.Run("should return the config when a machine identity has SSO read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, tn)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)
		sso.CreateSAMLConfig(t, tn, body)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		stored := readConfig(t, identity)

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
			EntryPoint: new(replacement.EntryPoint),
			Cert:       new(replacement.CertPEM()),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		stored := readConfig(t, s.Tenant.Admin)
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
			Cert: new(s.IdP.CertPEM()),
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

func TestSAMLConfig_LegacyPath(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the same config on the legacy path as on the new path", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		current, err := s.Tenant.Admin.API.GetSamlConfigWithResponse(t.Context())
		require.NoError(t, err)
		legacy, err := s.Tenant.Admin.API.GetSamlConfigWithResponse(t.Context(), legacyPath)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, current.StatusCode(), "%s", apierr.Body(current.Body))
		require.Equalf(t, http.StatusOK, legacy.StatusCode(), "%s", apierr.Body(legacy.Body))
		require.JSONEq(t, string(current.Body), string(legacy.Body))
	})

	t.Run("should create a config on the legacy path when the body still sends organizationId", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, tn)
		body := sso.SAMLConfigBody(tn, samlidp.New(t), sso.Okta)

		// Action
		res, err := tn.Admin.API.CreateSamlConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, body, tn.OrgID.String()), legacyPath)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, body.EntryPoint, readConfig(t, tn.Admin).EntryPoint)
	})

	t.Run("should update a config on the legacy path when the body still sends organizationId", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		replacement := samlidp.New(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, api.UpdateSamlConfigJSONRequestBody{EntryPoint: new(replacement.EntryPoint)}, s.Tenant.OrgID.String()),
			legacyPath)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, replacement.EntryPoint, readConfig(t, s.Tenant.Admin).EntryPoint)
	})

	t.Run("should act on the token's organization when a legacy body names another organization", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The organization now comes from the token. A legacy caller's organizationId is ignored, "+
			"so naming another organization can neither read nor change that organization's config.")

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, theirs)
		body := sso.SAMLConfigBody(theirs, samlidp.New(t), sso.Okta)

		// Action
		res, err := theirs.Admin.API.CreateSamlConfigWithBodyWithResponse(t.Context(), "application/json",
			legacyBody(t, body, mine.OrgID.String()), legacyPath)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, theirs.OrgID, res.JSON200.OrgId)
		requireNoConfig(t, mine)
	})
}

// legacyPath sends a request for /api/v1/sso/saml/config to the old /api/v1/sso/config mount.
// The legacy routes have no operationId, so the generated client has no methods of its own for them.
func legacyPath(_ context.Context, req *http.Request) error {
	req.URL.Path = strings.Replace(req.URL.Path, "/api/v1/sso/saml/config", "/api/v1/sso/config", 1)
	return nil
}

// legacyBody adds the organizationId that callers of the legacy path still send.
func legacyBody(t *testing.T, body any, organizationID string) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	fields := map[string]any{}
	require.NoError(t, json.Unmarshal(raw, &fields))
	fields["organizationId"] = organizationID
	raw, err = json.Marshal(fields)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

type storedConfig struct {
	EntryPoint, Issuer, Cert string
	IsActive                 bool
}

func readConfig(t *testing.T, actor *harness.Principal) storedConfig {
	t.Helper()
	res, err := actor.API.GetSamlConfigWithResponse(t.Context())
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
	res, err := tn.Admin.API.GetSamlConfigWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusNotFound, res.StatusCode(), "a SAML config exists: %s", apierr.Body(res.Body))
}
