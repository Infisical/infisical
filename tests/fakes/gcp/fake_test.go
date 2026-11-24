package gcp_test

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/gcp"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const (
	keyPrefix  = "gcpfake"
	issuerURI  = "https://issuer.test/organizations/acme"
	providerID = "infisical"
	account    = "deployer@acme.iam.gserviceaccount.com"
)

// A fake is a plain http.Handler, so it is provable without Docker. The issuer is a
// second server publishing a key the test signs with, reached through DialOrigin.
type rig struct {
	fakes  *httptest.Server
	cp     *gcp.ControlPlane
	key    *rsa.PrivateKey
	keyID  string
	issuer *httptest.Server
}

func newRig(t *testing.T) *rig {
	t.Helper()
	srv := fakenet.New(gcp.Services...)
	ca, err := fakenet.LoadOrCreateCA(filepath.Join(t.TempDir(), "ca.pem"))
	require.NoError(t, err)
	fakes := httptest.NewServer(srv)
	admin := httptest.NewServer(srv.Admin(ca))
	t.Cleanup(fakes.Close)
	t.Cleanup(admin.Close)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	require.NoError(t, fakenet.Listen(ctx, admin.URL, keyPrefix))

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	r := &rig{fakes: fakes, key: key, keyID: "k1"}
	r.issuer = httptest.NewServer(http.HandlerFunc(r.serveIssuer))
	t.Cleanup(r.issuer.Close)

	r.cp = gcp.Open(t, admin.URL, fmt.Sprintf("%s%d", keyPrefix, time.Now().UnixNano()))
	r.cp.TrustIssuer(t, providerID, issuerURI, r.issuer.URL)
	return r
}

func (r *rig) serveIssuer(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch req.URL.Path {
	case "/organizations/acme/.well-known/openid-configuration":
		_ = json.NewEncoder(w).Encode(map[string]any{"issuer": issuerURI, "jwks_uri": issuerURI + "/.well-known/jwks.json"})
	case "/organizations/acme/.well-known/jwks.json":
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{
			"kty": "RSA", "alg": "RS256", "use": "sig", "kid": r.keyID,
			"n": b64(r.key.N.Bytes()), "e": b64(big.NewInt(int64(r.key.E)).Bytes()),
		}}})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (r *rig) audience() string { return "https://iam.googleapis.com/" + r.cp.Provider(providerID) }

// claims are what Infisical signs for a project connection.
func (r *rig) claims(sub string) map[string]any {
	now := time.Now().Unix()
	return map[string]any{"iss": issuerURI, "sub": sub, "aud": r.audience(), "iat": now, "exp": now + 300, "project_id": "proj-1"}
}

func (r *rig) sign(t *testing.T, key *rsa.PrivateKey, claims map[string]any) string {
	t.Helper()
	header, err := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": r.keyID})
	require.NoError(t, err)
	body, err := json.Marshal(claims)
	require.NoError(t, err)
	signed := b64(header) + "." + b64(body)
	digest := sha256.Sum256([]byte(signed))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return signed + "." + b64(sig)
}

func (r *rig) post(t *testing.T, host, path, bearer string, body any) (int, map[string]any) {
	t.Helper()
	raw, err := json.Marshal(body)
	require.NoError(t, err)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, r.fakes.URL+path, bytes.NewReader(raw))
	require.NoError(t, err)
	req.Host = host
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	res, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	out, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var parsed map[string]any
	require.NoErrorf(t, json.Unmarshal(out, &parsed), "%s", out)
	return res.StatusCode, parsed
}

// exchange calls STS the way Infisical does.
func (r *rig) exchange(t *testing.T, provider, token string) (int, map[string]any) {
	t.Helper()
	return r.post(t, gcp.STS.Host(), "/v1/token", "", map[string]string{
		"grantType":          "urn:ietf:params:oauth:grant-type:token-exchange",
		"audience":           "//iam.googleapis.com/" + provider,
		"scope":              "https://www.googleapis.com/auth/cloud-platform",
		"requestedTokenType": "urn:ietf:params:oauth:token-type:access_token",
		"subjectTokenType":   "urn:ietf:params:oauth:token-type:jwt",
		"subjectToken":       token,
	})
}

func (r *rig) generateAccessToken(t *testing.T, federated, email string) (int, map[string]any) {
	t.Helper()
	return r.post(t, gcp.IAMCredentials.Host(),
		"/v1/projects/-/serviceAccounts/"+url.PathEscape(email)+":generateAccessToken", federated,
		map[string]any{"scope": []string{"https://www.googleapis.com/auth/cloud-platform"}, "lifetime": "3600s"})
}

func (r *rig) federatedToken(t *testing.T, claims map[string]any) string {
	t.Helper()
	status, body := r.exchange(t, r.cp.Provider(providerID), r.sign(t, r.key, claims))
	require.Equalf(t, http.StatusOK, status, "%v", body)
	return body["access_token"].(string)
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func TestGCPFake_TokenExchange(t *testing.T) {
	t.Run("should issue a federated token for a token the trusted issuer signed, mapping its claims", func(t *testing.T) {
		// Setup
		r := newRig(t)
		claims := r.claims("app-connection:1")

		// Action
		status, body := r.exchange(t, r.cp.Provider(providerID), r.sign(t, r.key, claims))

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", body)
		require.Equal(t, "Bearer", body["token_type"])
		require.InDelta(t, 300, body["expires_in"], 5, "a federated token lives as long as the token it replaced")
		e := r.cp.STS.ExpectEvent[gcp.TokenExchanged](t, nil)
		require.Equal(t, "app-connection:1", e.Subject)
		require.Equal(t, map[string]string{"project_id": "proj-1"}, e.Attributes)
	})

	t.Run("should accept a token without a mapped claim and map no attribute for it", func(t *testing.T) {
		// Setup
		r := newRig(t)
		claims := r.claims("app-connection:1")
		delete(claims, "project_id")

		// Action
		status, body := r.exchange(t, r.cp.Provider(providerID), r.sign(t, r.key, claims))

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", body)
		e := r.cp.STS.ExpectEvent[gcp.TokenExchanged](t, nil)
		require.Empty(t, e.Attributes)
	})

	refusals := []struct {
		name, code, description string
		edit                    func(r *rig, claims map[string]any)
		forged                  bool
	}{
		{name: "should refuse a token for another audience", code: "invalid_grant",
			description: "The audience in ID Token [https://iam.googleapis.com/other] does not match the expected audience.",
			edit:        func(_ *rig, c map[string]any) { c["aud"] = "https://iam.googleapis.com/other" }},
		{name: "should refuse a token from another issuer", code: "invalid_grant",
			description: "The issuer in ID Token https://issuer.test/organizations/other does not match the expected ones: " + issuerURI + ".",
			edit:        func(_ *rig, c map[string]any) { c["iss"] = "https://issuer.test/organizations/other" }},
		{name: "should refuse a token signed with a key the issuer does not publish", code: "invalid_grant",
			description: "Invalid ID Token signature.", forged: true},
		{name: "should refuse an expired token", code: "invalid_grant",
			edit: func(_ *rig, c map[string]any) { c["exp"] = time.Now().Add(-time.Minute).Unix() }},
		{name: "should refuse a subject over 127 bytes", code: "invalid_request",
			edit: func(_ *rig, c map[string]any) { c["sub"] = strings.Repeat("s", 128) }},
	}
	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			// Setup
			r := newRig(t)
			claims := r.claims("app-connection:1")
			if tc.edit != nil {
				tc.edit(r, claims)
			}
			key := r.key
			if tc.forged {
				other, err := rsa.GenerateKey(rand.Reader, 2048)
				require.NoError(t, err)
				key = other
			}

			// Action
			status, body := r.exchange(t, r.cp.Provider(providerID), r.sign(t, key, claims))

			// Assert
			require.Equal(t, http.StatusBadRequest, status)
			require.Equal(t, tc.code, body["error"])
			if tc.description != "" {
				require.Equal(t, tc.description, body["error_description"])
			}
			require.Empty(t, r.cp.STS.State(t).Exchanges)
		})
	}

	t.Run("should refuse a provider the pool does not have", func(t *testing.T) {
		// Setup
		r := newRig(t)

		// Action
		status, body := r.exchange(t, r.cp.Provider("missing"), r.sign(t, r.key, r.claims("app-connection:1")))

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "invalid_target", body["error"])
	})

	t.Run("should refuse an exchange that asks for no scope and issue nothing", func(t *testing.T) {
		// Setup
		r := newRig(t)

		// Action
		status, body := r.post(t, gcp.STS.Host(), "/v1/token", "", map[string]string{
			"grantType":          "urn:ietf:params:oauth:grant-type:token-exchange",
			"audience":           "//iam.googleapis.com/" + r.cp.Provider(providerID),
			"requestedTokenType": "urn:ietf:params:oauth:token-type:access_token",
			"subjectTokenType":   "urn:ietf:params:oauth:token-type:jwt",
			"subjectToken":       r.sign(t, r.key, r.claims("app-connection:1")),
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "invalid_request", body["error"])
		require.Empty(t, r.cp.STS.State(t).Exchanges)
	})
}

func TestGCPFake_GenerateAccessToken(t *testing.T) {
	t.Run("should issue a service account token to a subject it trusts", func(t *testing.T) {
		// Setup
		r := newRig(t)
		r.cp.GrantWorkloadIdentityUser(t, account, r.cp.Principal("app-connection:1"))
		federated := r.federatedToken(t, r.claims("app-connection:1"))

		// Action
		status, body := r.generateAccessToken(t, federated, account)

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", body)
		expire, err := time.Parse(time.RFC3339, body["expireTime"].(string))
		require.NoError(t, err)
		require.WithinDuration(t, time.Now().Add(time.Hour), expire, 5*time.Second)
		e := r.cp.IAMCredentials.ExpectEvent[gcp.AccessTokenIssued](t, nil)
		require.Equal(t, account, e.ServiceAccount)
		require.Equal(t, "app-connection:1", e.Subject)
	})

	t.Run("should issue a service account token to any subject with a trusted attribute", func(t *testing.T) {
		// Setup
		r := newRig(t)
		r.cp.GrantWorkloadIdentityUser(t, account, r.cp.PrincipalSet("project_id", "proj-1"))
		federated := r.federatedToken(t, r.claims("app-connection:2"))

		// Action
		status, body := r.generateAccessToken(t, federated, account)

		// Assert
		require.Equalf(t, http.StatusOK, status, "%v", body)
	})

	t.Run("should deny a subject the service account does not trust and issue nothing", func(t *testing.T) {
		// Setup
		r := newRig(t)
		r.cp.GrantWorkloadIdentityUser(t, account, r.cp.Principal("app-connection:1"), r.cp.PrincipalSet("project_id", "proj-9"))
		federated := r.federatedToken(t, r.claims("app-connection:2"))

		// Action
		status, body := r.generateAccessToken(t, federated, account)

		// Assert
		require.Equal(t, http.StatusForbidden, status)
		googleErr := body["error"].(map[string]any)
		require.Equal(t, "PERMISSION_DENIED", googleErr["status"])
		require.Equal(t, "Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist).", googleErr["message"])
		require.Empty(t, r.cp.IAMCredentials.State(t).Issued)
	})

	t.Run("should refuse a bearer token STS never issued", func(t *testing.T) {
		// Setup
		r := newRig(t)
		r.cp.GrantWorkloadIdentityUser(t, account, r.cp.PrincipalSet("project_id", "proj-1"))

		// Action
		status, body := r.generateAccessToken(t, "ya29.d.invented", account)

		// Assert
		require.Equal(t, http.StatusUnauthorized, status)
		require.Equal(t, "UNAUTHENTICATED", body["error"].(map[string]any)["status"])
	})
}
