package machineidentity_test

import (
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

func TestJwtAuth_Jwks(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for a JWT signed by a key the JWKS URL publishes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachJwks(t, tn, identityID, idp)

		// Action
		res := fedLoginJwt(t, tn, identityID, idp.sign(t, fedClaims(idp.issuer, "workload", "infisical", nil)))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should accept a key published after the method was attached without reconfiguring it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachJwks(t, tn, identityID, idp)
		rotated, kid := fedRSAKey(t), "rotated-"+id.Short()
		idp.cp.TrustKey(t, oidcidp.PublicJWK(kid, &rotated.PublicKey))

		// Action
		res := fedLoginJwt(t, tn, identityID, fedSignJWT(t, rotated, kid, fedClaims(idp.issuer, "workload", "infisical", nil)))

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
	})

	t.Run("should refuse a JWT whose signature does not match the published key and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachJwks(t, tn, identityID, idp)

		// Action
		res := fedLoginJwt(t, tn, identityID, fedSignJWT(t, fedRSAKey(t), idp.kid, fedClaims(idp.issuer, "workload", "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Equal(t, "Access denied: invalid signature", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})

	t.Run("should answer 404 when the identity has no JWT auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginJwt(t, tn, identityID, idp.sign(t, fedClaims(idp.issuer, "workload", "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "JWT auth method not found for identity, did you configure JWT auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func TestJwtAuth_JwksUnknownKey(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a JWT whose kid the JWKS does not publish and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		idp := fedNewOidcProvider(t, tn)
		identityID := fedNewIdentity(t, tn)
		fedAttachJwks(t, tn, identityID, idp)

		// Action
		res := fedLoginJwt(t, tn, identityID, fedSignJWT(t, fedRSAKey(t), "unpublished-"+id.Short(),
			fedClaims(idp.issuer, "workload", "infisical", nil)))

		// Assert
		fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "was not found in the configured JWKS")
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func fedAttachJwks(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, idp *fedOidcProvider) {
	t.Helper()
	res, err := tn.Admin.API.AttachJwtAuthWithBodyWithResponse(t.Context(), identityID.String(), "application/json", fedJSON(t, map[string]any{
		"configurationType": "jwks",
		"jwksUrl":           idp.cp.JWKSURL(),
		"boundIssuer":       idp.issuer,
		"boundAudiences":    "infisical",
		"boundSubject":      "workload",
		"boundClaims":       map[string]string{},
	}))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching JWT auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginJwt(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithJwtAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithJwtAuthWithResponse(t.Context(), api.LoginWithJwtAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}
