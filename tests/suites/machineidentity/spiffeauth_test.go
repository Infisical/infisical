package machineidentity_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	fedTrustDomain = "fed.example.test"
	fedSpiffeID    = "spiffe://" + fedTrustDomain + "/ns/payments/sa/api"
)

func TestSpiffeAuth_StaticBundle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a JWT-SVID signed by a key in the static bundle", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachSpiffe(t, tn, identityID, fedStaticBundle(t, idp))

		// Action
		res := fedLoginSpiffe(t, tn, identityID, idp.sign(t, fedClaims("", fedSpiffeID, "infisical", nil)))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	refusals := []struct {
		name    string
		message string
		svid    func(t *testing.T, idp *fedOidcProvider) string
	}{
		{
			name: "should refuse a JWT-SVID for another audience and issue no token", message: "JWT-SVID audience validation failed",
			svid: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims("", fedSpiffeID, "vault", nil))
			},
		},
		{
			name: "should refuse a SPIFFE ID outside the allowed patterns and issue no token", message: "Access denied",
			svid: func(t *testing.T, idp *fedOidcProvider) string {
				return idp.sign(t, fedClaims("", "spiffe://"+fedTrustDomain+"/ns/billing/sa/api", "infisical", nil))
			},
		},
		{
			name:    "should refuse a JWT-SVID signed by a key outside the bundle and issue no token",
			message: "No key in the SPIFFE trust bundle matches the JWT-SVID signing key",
			svid: func(t *testing.T, _ *fedOidcProvider) string {
				return fedSignJWT(t, fedRSAKey(t), "untrusted-"+id.Short(), fedClaims("", fedSpiffeID, "infisical", nil))
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
			fedAttachSpiffe(t, tn, identityID, fedStaticBundle(t, idp))

			// Action
			res := fedLoginSpiffe(t, tn, identityID, tc.svid(t, idp))

			// Assert
			fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
			require.Equal(t, tc.message, apierr.Message(res.Body))
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should refuse a SPIFFE ID from another trust domain even when the allowed IDs match any, and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachSpiffeAllowing(t, tn, identityID, fedStaticBundle(t, idp), "spiffe://**")
		accepted := fedLoginSpiffe(t, tn, fedNewIdentityWithSpiffeAny(t, tn, idp), idp.sign(t, fedClaims("", "spiffe://"+fedTrustDomain+"/ns/billing/sa/api", "infisical", nil)))
		require.NotNilf(t, accepted.JSON200, "a SPIFFE ID in the trust domain was refused with %d: %s", accepted.StatusCode(), apierr.Body(accepted.Body))

		// Action
		res := fedLoginSpiffe(t, tn, identityID, idp.sign(t, fedClaims("", "spiffe://other.example.test/ns/payments/sa/api", "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no SPIFFE auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginSpiffe(t, tn, identityID, idp.sign(t, fedClaims("", fedSpiffeID, "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "SPIFFE auth method not found for identity, did you configure SPIFFE auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func TestSpiffeAuth_WebBundle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a JWT-SVID signed by a key the bundle endpoint serves", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachSpiffe(t, tn, identityID, fedWebBundle(idp))

		// Action
		res := fedLoginSpiffe(t, tn, identityID, idp.sign(t, fedClaims("", fedSpiffeID, "infisical", nil)))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a JWT-SVID signed by a key the bundle endpoint does not serve and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachSpiffe(t, tn, identityID, fedWebBundle(idp))

		// Action
		res := fedLoginSpiffe(t, tn, identityID, fedSignJWT(t, fedRSAKey(t), "untrusted-"+id.Short(), fedClaims("", fedSpiffeID, "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "No key in the SPIFFE trust bundle matches the JWT-SVID signing key", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should refetch the cached bundle and accept a key the endpoint started serving after the last fetch", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachSpiffe(t, tn, identityID, fedWebBundle(idp))
		first := fedLoginSpiffe(t, tn, identityID, idp.sign(t, fedClaims("", fedSpiffeID, "infisical", nil)))
		require.NotNilf(t, first.JSON200, "first login returned %d: %s", first.StatusCode(), apierr.Body(first.Body))
		rotated, kid := fedRSAKey(t), "rotated-"+id.Short()
		idp.cp.TrustKey(t, oidcidp.PublicJWK(kid, &rotated.PublicKey))

		// Action
		res := fedLoginSpiffe(t, tn, identityID, fedSignJWT(t, rotated, kid, fedClaims("", fedSpiffeID, "infisical", nil)))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})
}

func fedNewIdentityWithSpiffeAny(t *testing.T, tn *harness.Tenant, idp *fedOidcProvider) uuid.UUID {
	t.Helper()
	identityID := fedNewIdentity(t, tn)
	fedAttachSpiffeAllowing(t, tn, identityID, fedStaticBundle(t, idp), "spiffe://**")
	return identityID
}

// fedStaticBundle is the provider's test key as a SPIFFE bundle an admin uploads.
func fedStaticBundle(t *testing.T, idp *fedOidcProvider) map[string]any {
	t.Helper()
	jwk := oidcidp.PublicJWK(idp.kid, &idp.key.PublicKey)
	jwk.Use = "jwt-svid"
	bundle, err := json.Marshal(map[string]any{"keys": []oidcidp.JWK{jwk}})
	require.NoError(t, err)
	return map[string]any{"profile": "static", "bundle": string(bundle)}
}

func fedWebBundle(idp *fedOidcProvider) map[string]any {
	return map[string]any{"profile": "https_web_bundle", "endpointUrl": idp.cp.SpiffeBundleURL()}
}

func fedAttachSpiffe(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, distribution map[string]any) {
	t.Helper()
	fedAttachSpiffeAllowing(t, tn, identityID, distribution, "spiffe://"+fedTrustDomain+"/ns/payments/**")
}

func fedAttachSpiffeAllowing(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, distribution map[string]any, allowedIDs string) {
	t.Helper()
	res, err := tn.Admin.API.AttachSpiffeAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json", fedJSON(t, map[string]any{
		"trustDomain":             fedTrustDomain,
		"allowedSpiffeIds":        allowedIDs,
		"allowedAudiences":        "infisical",
		"trustBundleDistribution": distribution,
	}))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching SPIFFE auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginSpiffe(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithSpiffeAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithSpiffeAuthWithResponse(t.Context(), api.LoginWithSpiffeAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}
