package machineidentity_test

import (
	"crypto/rsa"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOidcAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token when issuer, audience, subject and bound claims match", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOidc(t, tn, identityID, fedOidcBindings(idp))

		// Action
		res := fedLoginOidc(t, tn, identityID, idp.sign(t, fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "payments"})))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
		require.Equal(t, "oidc-auth", *fedIdentity(t, tn, identityID).JSON200.Identity.LastLoginAuthMethod)
	})

	refusals := []struct {
		name    string
		status  int
		message string
		token   func(t *testing.T, idp *fedOidcProvider) string
	}{
		{
			name: "should refuse a JWT for another audience and issue no token", status: http.StatusUnauthorized,
			message: "Access denied: OIDC audience not allowed.",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims(idp.issuer, "repo:acme/app", "someone-else", map[string]any{"team": "payments"}))
			},
		},
		{
			name: "should refuse a JWT for another subject and issue no token", status: http.StatusForbidden,
			message: "Access denied: OIDC subject not allowed.",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims(idp.issuer, "repo:acme/other", "infisical", map[string]any{"team": "payments"}))
			},
		},
		{
			name: "should refuse a JWT whose bound claim differs and issue no token", status: http.StatusUnauthorized,
			message: "Access denied: OIDC claim not allowed.",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "billing"}))
			},
		},
		{
			name: "should refuse a JWT from another issuer and issue no token", status: http.StatusUnauthorized,
			message: "Access denied: jwt issuer invalid. expected: ",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims(oidcidp.IssuerURL("elsewhere"), "repo:acme/app", "infisical", map[string]any{"team": "payments"}))
			},
		},
		{
			name: "should refuse a JWT signed by a key outside the JWKS and issue no token", status: http.StatusUnauthorized,
			message: "was not found in the OIDC provider's JWKS endpoint",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				return fedSignJWT(t, fedRSAKey(t), "untrusted-"+id.Short(),
					fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "payments"}))
			},
		},
		{
			name: "should refuse an expired JWT and issue no token", status: http.StatusUnauthorized,
			message: "Access denied: jwt expired",
			token: func(t *testing.T, idp *fedOidcProvider) string {
				claims := fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "payments"})
				claims["iat"] = time.Now().Add(-2 * time.Hour).Unix()
				claims["nbf"] = time.Now().Add(-2 * time.Hour).Unix()
				claims["exp"] = time.Now().Add(-time.Hour).Unix()
				return idp.sign(t, claims)
			},
		},
	}
	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			idp := fedNewOidcProvider(t, tn)
			identityID := fedNewIdentity(t, tn)
			fedAttachOidc(t, tn, identityID, fedOidcBindings(idp))

			// Action
			res := fedLoginOidc(t, tn, identityID, tc.token(t, idp))

			// Assert
			fedRequireStatus(t, tc.status, res.StatusCode(), res.Body)
			require.Contains(t, apierr.Message(res.Body), tc.message)
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should answer 404 when the identity has no OIDC auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginOidc(t, tn, identityID, idp.sign(t, fedClaims(idp.issuer, "repo:acme/app", "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "OIDC auth method not found for identity, did you configure OIDC auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func TestOidcAuth_ClaimMetadata(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should expose a mapped claim to role templates as identity.auth.oidc.claims", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, team := range []string{"backend", "frontend"} {
			secretmanager.CreateFolder(t, proj, "dev", "/"+team)
			secretmanager.CreateSecret(t, proj, "dev", "KEY", team, secretmanager.WithPath("/"+team))
		}
		proj.NewRole(t, "own-team", fixture.Permission{
			Subject:    "secrets",
			Action:     []string{"read"},
			Conditions: map[string]any{"secretPath": "/{{identity.auth.oidc.claims.team}}"},
		})
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		body := fedOidcBindings(idp)
		body.ClaimMetadataMapping = &map[string]string{"team": "department"}
		fedAttachOidc(t, tn, identityID, body)
		login := fedLoginOidc(t, tn, identityID, idp.sign(t,
			fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "payments", "department": "backend"})))
		require.NotNilf(t, login.JSON200, "login returned %d: %s", login.StatusCode(), apierr.Body(login.Body))
		identity := fedPrincipal(t, tn, identityID, login.JSON200.AccessToken)
		proj.Grant(t, identity, "own-team")

		// Action
		own := fedListSecretKeys(t, identity, proj, "/backend")
		other := fedListSecretKeys(t, identity, proj, "/frontend")

		// Assert
		require.Equal(t, []string{"KEY"}, own)
		require.Empty(t, other)
	})
}

func TestOidcAuth_Remove(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the tokens it issued once OIDC auth is removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachOidc(t, tn, identityID, fedOidcBindings(idp))
		jwt := idp.sign(t, fedClaims(idp.issuer, "repo:acme/app", "infisical", map[string]any{"team": "payments"}))
		login := fedLoginOidc(t, tn, identityID, jwt)
		require.NotNilf(t, login.JSON200, "login returned %d: %s", login.StatusCode(), apierr.Body(login.Body))
		fedRequireTokenWorks(t, tn, login.JSON200.AccessToken)

		// Action
		res, err := tn.Admin.API.DeleteOidcAuthWithResponse(t.Context(), identityID.String())

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		status, body := fedWaitTokenRefused(t, tn, login.JSON200.AccessToken)
		fedRequireStatus(t, http.StatusUnauthorized, status, body)
		again := fedLoginOidc(t, tn, identityID, jwt)
		fedRequireStatus(t, http.StatusNotFound, again.StatusCode(), again.Body)
	})
}

func TestOidcAuth_TrustedIPs(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a non-wildcard trusted IP range when the plan lacks IP allowlisting and attach nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.IPAllowlisting)))
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		body := fedOidcBindings(idp)
		body.AccessTokenTrustedIps = fedTrustedIPs("10.0.0.0/8")

		// Action
		res, err := tn.Admin.API.AttachOidcAuthWithResponse(t.Context(), identityID.String(), body)

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range.",
			apierr.Message(res.Body))
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "oidc-auth")
	})
}

// fedOidcProvider is a tenant's OIDC provider in fakenet, publishing a key the test signs with.
type fedOidcProvider struct {
	issuer string
	key    *rsa.PrivateKey
	kid    string
	cp     *oidcidp.ControlPlane
}

func fedNewOidcProvider(t *testing.T, tn *harness.Tenant) *fedOidcProvider {
	t.Helper()
	cp := oidcidp.Open(t, fixture.FakenetAdmin(t, tn), id.Nonce())
	key := fedRSAKey(t)
	kid := "k-" + id.Short()
	cp.TrustKey(t, oidcidp.PublicJWK(kid, &key.PublicKey))
	return &fedOidcProvider{issuer: cp.DiscoveryURL(), key: key, kid: kid, cp: cp}
}

func (p *fedOidcProvider) sign(t *testing.T, claims map[string]any) string {
	t.Helper()
	return fedSignJWT(t, p.key, p.kid, claims)
}

// fedOidcBindings binds audience, subject and one claim, so each can be refused alone.
func fedOidcBindings(p *fedOidcProvider) api.AttachOidcAuthJSONRequestBody {
	return api.AttachOidcAuthJSONRequestBody{
		OidcDiscoveryUrl: new(p.issuer),
		BoundIssuer:      new(p.issuer),
		BoundAudiences:   new("infisical"),
		BoundSubject:     new("repo:acme/app"),
		BoundClaims:      map[string]string{"team": "payments"},
	}
}

func fedAttachOidc(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, body api.AttachOidcAuthJSONRequestBody) {
	t.Helper()
	res, err := tn.Admin.API.AttachOidcAuthWithResponse(t.Context(), identityID.String(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching OIDC auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginOidc(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithOidcAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithOidcAuthWithResponse(t.Context(), api.LoginWithOidcAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}

// fedListSecretKeys lists a dev folder as pr and returns the keys it can see.
func fedListSecretKeys(t *testing.T, pr *harness.Principal, proj *fixture.Project, path string) []string {
	t.Helper()
	res, err := pr.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId: &proj.ID, Environment: new("dev"), SecretPath: &path,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing %s returned %d: %s", path, res.StatusCode(), apierr.Body(res.Body))
	keys := []string{}
	for _, s := range res.JSON200.Secrets {
		keys = append(keys, s.SecretKey)
	}
	return keys
}
