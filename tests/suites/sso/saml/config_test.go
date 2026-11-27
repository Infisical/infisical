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

	t.Run("should return a conflict and keep the existing config when the organization already has one", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		before := readConfig(t, s.Tenant.Admin)

		// Action
		res, err := s.Tenant.Admin.API.CreateSamlConfigWithResponse(t.Context(), sso.SAMLConfigBody(s.Tenant, samlidp.New(t), sso.Okta))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusConflict, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "A SAML configuration already exists")
		require.Equal(t, before, readConfig(t, s.Tenant.Admin))
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

	t.Run("should create the config in the caller's organization and leave other organizations untouched", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		fixture.VerifiedEmailDomain(t, theirs)
		body := sso.SAMLConfigBody(mine, samlidp.New(t), sso.Okta)

		// Action
		res, err := theirs.Admin.API.CreateSamlConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, body.EntryPoint, readConfig(t, theirs.Admin).EntryPoint)
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

	t.Run("should return the values to enter in the IdP", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		res, err := s.Tenant.Admin.API.GetSamlConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		requireSpValues(t, s.ConfigID.String(), res.JSON200.AcsUrl, res.JSON200.SpEntityId)
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

	t.Run("should return not found and leave the organization untouched when there is no config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			IsActive: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "SAML configuration for organization")
		requireNoConfig(t, tn)
	})

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

	t.Run("should keep SSO enforcement when an update resends the stored settings", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "A Terraform apply resends every field; enforcement must survive an update that changes nothing.")

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), storedSettings(s))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, authEnforced(t, s.Tenant))
	})

	t.Run("should keep SSO enforcement when an update changes only the MFA signal fields", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)
		body := storedSettings(s)
		body.MfaAuthnContexts = &[]string{"urn:example:mfa"}

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, authEnforced(t, s.Tenant))
	})

	t.Run("should turn off SSO enforcement when an update changes the entry point", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "A new entry point can break every login, so enforcement is turned off to keep the admin from being locked out.")

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)

		// Action
		res, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			EntryPoint: new(samlidp.New(t).EntryPoint),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.False(t, authEnforced(t, s.Tenant))
	})
}

func TestSAMLConfig_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should remove the config and turn off SSO enforcement when an admin deletes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		s.Enforce(t)

		// Action
		res, err := s.Tenant.Admin.API.DeleteSamlConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, s.ConfigID, res.JSON200.Id)
		requireNoConfig(t, s.Tenant)
		require.False(t, authEnforced(t, s.Tenant))
	})

	t.Run("should return not found when the organization has no config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)

		// Action
		res, err := tn.Admin.API.DeleteSamlConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "SAML configuration for organization")
	})

	t.Run("should reject the delete and keep the config when the actor is a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		member := s.Tenant.NewUser(t)

		// Action
		res, err := member.API.DeleteSamlConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.True(t, readConfig(t, s.Tenant.Admin).IsActive)
	})

	t.Run("should not serve delete on the legacy path and keep the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		res, err := s.Tenant.Admin.API.DeleteSamlConfigWithResponse(t.Context(), legacyPath)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.True(t, readConfig(t, s.Tenant.Admin).IsActive)
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

// storedSettings is an update body that resends every connection field exactly as setup stored it.
func storedSettings(s *sso.SAML) api.UpdateSamlConfigJSONRequestBody {
	return api.UpdateSamlConfigJSONRequestBody{
		AuthProvider:    new(api.UpdateSamlConfigJSONBodyAuthProvider(sso.Okta)),
		IsActive:        new(true),
		EntryPoint:      new(s.IdP.EntryPoint),
		Issuer:          new(s.Issuer),
		Cert:            new(s.IdP.CertPEM()),
		EnableGroupSync: new(false),
	}
}

func requireSpValues(t *testing.T, configID, acsURL, spEntityID string) {
	t.Helper()
	siteURL := harness.From(t).App().SiteURL()
	require.Equal(t, siteURL+"/api/v1/sso/saml2/"+configID, acsURL)
	require.Equal(t, siteURL, spEntityID)
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
