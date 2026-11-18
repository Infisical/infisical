package oauth

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const testAccount = "harness-a@proj.iam.gserviceaccount.com"

func newGCP(t *testing.T) (*httptest.Server, *GCPControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, Google, GCPIAMCredentials, GCPCertificateManager)
	return fakes, OpenGCP(t, adminURL, testAccount)
}

func gcpCall(t *testing.T, fakes *httptest.Server, host, method, path, token string, body io.Reader, contentType string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, body)
	require.NoError(t, err)
	req.Host = host
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func instanceAssertion(t *testing.T, key *rsa.PrivateKey, aud string) string {
	t.Helper()
	enc := func(v any) string {
		raw, err := json.Marshal(v)
		require.NoError(t, err)
		return base64.RawURLEncoding.EncodeToString(raw)
	}
	signing := enc(map[string]string{"alg": "RS256", "typ": "JWT"}) + "." + enc(map[string]any{
		"iss": GCPInstanceServiceAccountEmail, "aud": aud, "scope": "https://www.googleapis.com/auth/cloud-platform",
		"iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(),
	})
	sum := sha256.Sum256([]byte(signing))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	require.NoError(t, err)
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func instanceKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	block, _ := pem.Decode([]byte(gcpInstanceKeyPEM))
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	require.NoError(t, err)
	return key
}

func redeem(t *testing.T, fakes *httptest.Server, assertion string) (int, map[string]any) {
	t.Helper()
	form := url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {assertion}}
	return gcpCall(t, fakes, Google.Host(), "POST", "/oauth2/v4/token", "", strings.NewReader(form.Encode()), "application/x-www-form-urlencoded")
}

func impersonate(t *testing.T, fakes *httptest.Server) string {
	t.Helper()
	_, tok := redeem(t, fakes, instanceAssertion(t, instanceKey(t), gcpTokenURL))
	code, out := gcpCall(t, fakes, GCPIAMCredentials.Host(), "POST", "/v1/projects/-/serviceAccounts/"+testAccount+":generateAccessToken", tok["access_token"].(string), strings.NewReader(`{"scope":["https://www.googleapis.com/auth/cloud-platform"]}`), "application/json")
	require.Equal(t, http.StatusOK, code)
	return out["accessToken"].(string)
}

func selfManagedBody(t *testing.T) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "a.test"}, DNSNames: []string{"a.test"}, NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	kder, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	raw, err := json.Marshal(map[string]any{"selfManaged": map[string]string{
		"pemCertificate": string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		"pemPrivateKey":  string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: kder})),
	}})
	require.NoError(t, err)
	return string(raw)
}

const certificates = "/v1/projects/p1/locations/global/certificates"

func TestGCPFake_Token(t *testing.T) {
	t.Run("should refuse an instance assertion signed by another key", func(t *testing.T) {
		// Setup
		fakes, _ := newGCP(t)
		other, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)

		// Action
		code, out := redeem(t, fakes, instanceAssertion(t, other, gcpTokenURL))

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Equal(t, "invalid_grant", out["error"])
	})

	t.Run("should refuse to impersonate without a token the token endpoint issued", func(t *testing.T) {
		// Setup
		fakes, _ := newGCP(t)

		// Action
		code, _ := gcpCall(t, fakes, GCPIAMCredentials.Host(), "POST", "/v1/projects/-/serviceAccounts/"+testAccount+":generateAccessToken", "ya29.forged", strings.NewReader("{}"), "application/json")

		// Assert
		require.NotEqual(t, http.StatusOK, code)
	})
}

func TestGCPFake_Certificates(t *testing.T) {
	t.Run("should finish a create's operation once it is polled", func(t *testing.T) {
		// Setup
		fakes, cp := newGCP(t)
		token := impersonate(t, fakes)
		_, op := gcpCall(t, fakes, GCPCertificateManager.Host(), "POST", certificates+"?certificateId=web", token, strings.NewReader(selfManagedBody(t)), "application/json")
		require.Equal(t, false, op["done"])

		// Action
		code, polled := gcpCall(t, fakes, GCPCertificateManager.Host(), "GET", "/v1/"+op["name"].(string), token, nil, "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, true, polled["done"])
		require.Contains(t, cp.CertificateManager.State(t).Certificates, "projects/p1/locations/global/certificates/web")
	})

	t.Run("should refuse a second certificate under the same id", func(t *testing.T) {
		// Setup
		fakes, _ := newGCP(t)
		token := impersonate(t, fakes)
		gcpCall(t, fakes, GCPCertificateManager.Host(), "POST", certificates+"?certificateId=web", token, strings.NewReader(selfManagedBody(t)), "application/json")

		// Action
		code, out := gcpCall(t, fakes, GCPCertificateManager.Host(), "POST", certificates+"?certificateId=web", token, strings.NewReader(selfManagedBody(t)), "application/json")

		// Assert
		require.Equal(t, http.StatusConflict, code)
		require.Equal(t, "ALREADY_EXISTS", out["error"].(map[string]any)["status"])
	})

	t.Run("should page the certificate list", func(t *testing.T) {
		// Setup
		fakes, _ := newGCP(t)
		token := impersonate(t, fakes)
		for _, id := range []string{"a", "b", "c"} {
			gcpCall(t, fakes, GCPCertificateManager.Host(), "POST", certificates+"?certificateId="+id, token, strings.NewReader(selfManagedBody(t)), "application/json")
		}

		// Action
		_, first := gcpCall(t, fakes, GCPCertificateManager.Host(), "GET", certificates+"?pageSize=2", token, nil, "")
		_, second := gcpCall(t, fakes, GCPCertificateManager.Host(), "GET", certificates+"?pageSize=2&pageToken="+first["nextPageToken"].(string), token, nil, "")

		// Assert
		require.Len(t, first["certificates"], 2)
		require.Len(t, second["certificates"], 1)
		require.Nil(t, second["nextPageToken"])
	})
}
