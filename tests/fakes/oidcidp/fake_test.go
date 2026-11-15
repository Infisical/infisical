package oidcidp_test

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const tenant = "acme"

func newProvider(t *testing.T) fakenet.Fake {
	t.Helper()
	p := oidcidp.Service.New(fakenet.Emitter{})
	seed(t, p, oidcidp.Client("client-1", "secret-1"))
	return p
}

func seed(t *testing.T, p fakenet.Fake, fragment any) {
	t.Helper()
	raw, err := json.Marshal(fragment)
	require.NoError(t, err)
	require.NoError(t, p.Seed(raw))
}

func get(t *testing.T, p fakenet.Fake, path string) map[string]any {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
	req.Host = oidcidp.Service.Host()
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	return out
}

func redeem(t *testing.T, p fakenet.Fake, code, secret string) (int, map[string]any) {
	t.Helper()
	form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {"https://app.test/cb"}}
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/"+tenant+"/token", strings.NewReader(form.Encode()))
	req.Host = oidcidp.Service.Host()
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth("client-1", secret)
	rec := httptest.NewRecorder()
	p.ServeHTTP(rec, req)
	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	return rec.Code, out
}

func withCode(code string, person oidcidp.Person) oidcidp.Provider {
	return oidcidp.Provider{Codes: map[string]oidcidp.Person{code: person}}
}

func TestScope(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/acme/.well-known/openid-configuration", nil)
	key, ok := oidcidp.Service.Scope(req)
	require.True(t, ok)
	require.Equal(t, tenant, key)
}

func TestDiscovery(t *testing.T) {
	t.Parallel()
	doc := get(t, newProvider(t), "/"+tenant+"/.well-known/openid-configuration")
	require.Equal(t, oidcidp.IssuerURL(tenant), doc["issuer"])
	require.Equal(t, oidcidp.IssuerURL(tenant)+"/token", doc["token_endpoint"])
	require.NotContains(t, doc, "code_challenge_methods_supported")
}

func TestToken(t *testing.T) {
	t.Parallel()

	t.Run("should issue an ID token the JWKS verifies, carrying the person", func(t *testing.T) {
		t.Parallel()
		p := newProvider(t)
		seed(t, p, withCode("c1", oidcidp.Person{Subject: "sub-1", Email: "ada@acme.test", GivenName: "Ada", FamilyName: "L"}))

		status, body := redeem(t, p, "c1", "secret-1")

		require.Equal(t, http.StatusOK, status)
		claims := verify(t, p, body["id_token"].(string))
		require.Equal(t, "sub-1", claims["sub"])
		require.Equal(t, "ada@acme.test", claims["email"])
		require.Equal(t, oidcidp.IssuerURL(tenant), claims["iss"])
		require.Equal(t, "client-1", claims["aud"])
	})

	t.Run("should refuse a code the second time", func(t *testing.T) {
		t.Parallel()
		p := newProvider(t)
		seed(t, p, withCode("c1", oidcidp.Person{Subject: "sub-1", Email: "ada@acme.test"}))
		status, _ := redeem(t, p, "c1", "secret-1")
		require.Equal(t, http.StatusOK, status)

		status, body := redeem(t, p, "c1", "secret-1")

		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "invalid_grant", body["error"])
	})

	t.Run("should refuse a client with the wrong secret and keep the code", func(t *testing.T) {
		t.Parallel()
		p := newProvider(t)
		seed(t, p, withCode("c1", oidcidp.Person{Subject: "sub-1", Email: "ada@acme.test"}))

		status, body := redeem(t, p, "c1", "wrong")

		require.Equal(t, http.StatusUnauthorized, status)
		require.Equal(t, "invalid_client", body["error"])
		ok, _ := redeem(t, p, "c1", "secret-1")
		require.Equal(t, http.StatusOK, ok)
	})
}

func verify(t *testing.T, p fakenet.Fake, token string) map[string]any {
	t.Helper()
	keys := get(t, p, "/"+tenant+"/jwks")["keys"].([]any)
	jwk := keys[0].(map[string]any)
	n, err := base64.RawURLEncoding.DecodeString(jwk["n"].(string))
	require.NoError(t, err)
	e, err := base64.RawURLEncoding.DecodeString(jwk["e"].(string))
	require.NoError(t, err)
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}

	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	require.NoError(t, err)
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	require.NoError(t, rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig))

	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var claims map[string]any
	require.NoError(t, json.Unmarshal(raw, &claims))
	return claims
}
