package organization_test

import (
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOIDCIssuer_SignedToken(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should verify a token it signed against the org's JWKS, naming the org as issuer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		token := federatedAssertion(t, tn)

		// Assert
		key := jwksKey(t, tn, token)
		require.NotNil(t, key, "the org's JWKS does not publish the key the token names")
		require.True(t, verifiesRS256(token, key))
		claims := jwtClaims(t, token)
		require.Equal(t, h.App().SiteURL()+"/api/v1/oidc-issuer/organizations/"+tn.OrgID.String(), claims["iss"])
		require.Equal(t, "api://AzureADTokenExchange", claims["aud"])
	})

	t.Run("should not verify one org's token against another org's JWKS", func(t *testing.T) {
		t.Parallel()

		// Setup
		signer, other := h.NewTenant(t), h.NewTenant(t)
		federatedAssertion(t, other)

		// Action
		token := federatedAssertion(t, signer)

		// Assert
		require.Nil(t, jwksKey(t, other, token), "another org's JWKS publishes this org's signing key")
		for _, k := range jwksKeys(t, other) {
			require.False(t, verifiesRS256(token, &k))
		}
	})
}

// federatedAssertion has the org sign a token the only way a customer can: an Azure Key
// Vault connection that authenticates by workload identity federation, which presents
// a token from the org's issuer to Entra. The connection is created, then updated,
// because a new connection has no subject Azure could trust yet and skips the exchange.
// The Azure fake records the assertion.
func federatedAssertion(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	entraTenant := uuid.NewString()
	entra := azure.Open(t, fixture.FakenetAdmin(t, tn), entraTenant)
	credentials := map[string]any{"tenantId": entraTenant, "clientId": uuid.NewString()}

	created, err := tn.Admin.API.CreateAzureKeyVaultAppConnectionWithBodyWithResponse(t.Context(), "application/json",
		orgJSON(t, map[string]any{"name": "akv-" + id.Short(), "method": "managed-identity", "credentials": credentials}))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
	var body struct {
		AppConnection struct {
			ID uuid.UUID `json:"id"`
		} `json:"appConnection"`
	}
	require.NoError(t, json.Unmarshal(created.Body, &body))

	updated, err := tn.Admin.API.UpdateAzureKeyVaultAppConnectionWithBodyWithResponse(t.Context(), body.AppConnection.ID, "application/json",
		orgJSON(t, map[string]any{"credentials": credentials}))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, updated.StatusCode(), updated.Body)

	assertions := entra.State(t).Assertions
	require.Len(t, assertions, 1, "Entra received no client assertion")
	return assertions[0].Assertion
}

type jwk struct{ Kid, N, E string }

func jwksKeys(t *testing.T, tn *harness.Tenant) []jwk {
	t.Helper()
	res, err := tn.Anonymous(t).GetOidcIssuerJwksWithResponse(t.Context(), tn.OrgID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the JWKS returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	keys := make([]jwk, 0, len(res.JSON200.Keys))
	for _, k := range res.JSON200.Keys {
		keys = append(keys, jwk{Kid: k.Kid, N: k.N, E: k.E})
	}
	return keys
}

// jwksKey is the published key the token's header names, or nil.
func jwksKey(t *testing.T, tn *harness.Tenant, token string) *jwk {
	t.Helper()
	var header struct {
		Kid string `json:"kid"`
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.Split(token, ".")[0])
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, &header))
	for _, k := range jwksKeys(t, tn) {
		if k.Kid == header.Kid {
			return &k
		}
	}
	return nil
}

func verifiesRS256(token string, k *jwk) bool {
	parts := strings.Split(token, ".")
	n, errN := base64.RawURLEncoding.DecodeString(k.N)
	e, errE := base64.RawURLEncoding.DecodeString(k.E)
	sig, errS := base64.RawURLEncoding.DecodeString(parts[2])
	if errN != nil || errE != nil || errS != nil {
		return false
	}
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	return rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) == nil
}

func jwtClaims(t *testing.T, token string) map[string]any {
	t.Helper()
	raw, err := base64.RawURLEncoding.DecodeString(strings.Split(token, ".")[1])
	require.NoError(t, err)
	var claims map[string]any
	require.NoError(t, json.Unmarshal(raw, &claims))
	return claims
}

func orgJSON(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}
