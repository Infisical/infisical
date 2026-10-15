package saml_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestSAMLRedirect(t *testing.T) {
	t.Parallel()

	t.Run("should redirect to the IdP with a SAML request when started by org slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		res, err := s.Browser.RedirectSamlByOrgSlugWithResponse(t.Context(), s.Tenant.OrgSlug, nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		location := res.HTTPResponse.Header.Get("Location")
		require.True(t, strings.HasPrefix(location, s.IdP.EntryPoint+"?"), "redirected to %s", location)
		req := s.IdP.ParseRedirect(t, location)
		require.Equal(t, s.Issuer, req.Issuer)
		require.Equal(t, s.SiteURL+"/api/v1/sso/saml2/"+s.ConfigID.String(), req.ACSURL)
		require.Equal(t, map[string]any{"spInitiated": true, "callbackPort": ""}, relayState(t, req.RelayState))
	})

	t.Run("should carry the callback port in RelayState when callback_port is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		req := s.StartLogin(t, &api.RedirectSamlByOrgSlugParams{CallbackPort: new("5555")})

		// Assert
		require.Equal(t, "5555", relayState(t, req.RelayState)["callbackPort"])
	})

	t.Run("should redirect to the IdP when started by a verified email domain", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		domain := strings.SplitN(s.Tenant.Email("x"), "@", 2)[1]

		// Action
		res, err := s.Browser.RedirectSamlByDomainWithResponse(t.Context(), domain, nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		req := s.IdP.ParseRedirect(t, res.HTTPResponse.Header.Get("Location"))
		require.Equal(t, s.SiteURL+"/api/v1/sso/saml2/"+s.ConfigID.String(), req.ACSURL)
	})

	t.Run("should forward to SAML when the generic SSO redirect finds SAML configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)

		// Action
		res, err := s.Browser.RedirectOrgSSOWithResponse(t.Context(), s.Tenant.OrgSlug, nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		forwarded, err := url.Parse(res.HTTPResponse.Header.Get("Location"))
		require.NoError(t, err)
		require.Equal(t, "/api/v1/sso/redirect/saml2/organizations/"+s.Tenant.OrgSlug, forwarded.Path)
	})

	t.Run("should return not found when the org slug does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		slug := "missing-" + id.Short()

		// Action
		res, err := s.Browser.RedirectSamlByOrgSlugWithResponse(t.Context(), slug, nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, string(res.Body), "Organization with slug '"+slug+"' not found")
	})

	t.Run("should return not found when the email domain is not verified", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		domain := "unverified-" + id.Short() + ".test"

		// Action
		res, err := s.Browser.RedirectSamlByDomainWithResponse(t.Context(), domain, nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, string(res.Body), "No verified domain found for '"+domain+"'")
	})

	t.Run("should refuse to start when the config is inactive", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t, sso.Okta)
		updated, err := s.Tenant.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.Tenant.OrgID.String(),
			IsActive:       new(false),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, updated.StatusCode(), "deactivating: %s", apierr.Body(updated.Body))

		// Action
		res, err := s.Browser.RedirectSamlByConfigIdWithResponse(t.Context(), s.ConfigID.String(), nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, string(res.Body), "Failed to authenticate with SAML SSO")
	})
}

func relayState(t *testing.T, raw string) map[string]any {
	t.Helper()
	var state map[string]any
	require.NoError(t, json.Unmarshal([]byte(raw), &state), "RelayState is not JSON: %q", raw)
	return state
}
