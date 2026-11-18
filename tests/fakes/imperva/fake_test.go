package imperva_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newAccount(t *testing.T, apiID string) (*httptest.Server, *imperva.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, imperva.Provisioning, imperva.REST)
	return fakes, imperva.Open(t, adminURL, apiID)
}

func call(t *testing.T, fakes *httptest.Server, host, apiID, key, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = host
	req.Header.Set("x-API-Id", apiID)
	req.Header.Set("x-API-Key", key)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	require.NoError(t, json.NewDecoder(res.Body).Decode(&out))
	return res.StatusCode, out
}

func certFor(t *testing.T, names ...string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: names[0]}, DNSNames: names,
		NotBefore: time.Now(), NotAfter: time.Now().Add(time.Hour)}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

func upload(t *testing.T, cert, authType string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]string{
		"certificate": base64.StdEncoding.EncodeToString([]byte(cert)),
		"private_key": base64.StdEncoding.EncodeToString([]byte("-----BEGIN PRIVATE KEY-----")),
		"auth_type":   authType,
	})
	require.NoError(t, err)
	return string(raw)
}

func TestImpervaFake_CustomCertificate(t *testing.T) {
	t.Run("should report an upload on the REST host, flagged when it misses one of the site's domains", func(t *testing.T) {
		// Setup
		fakes, cp := newAccount(t, "id-a")
		cp.Seed(t, imperva.WithSite("101", "shop", "shop.test", "www.shop.test"))
		code, _ := call(t, fakes, imperva.Provisioning.Host(), "id-a", imperva.APIKey("id-a"), "PUT", "/api/prov/v2/sites/101/customCertificate", upload(t, certFor(t, "shop.test"), "ECC"))
		require.Equal(t, http.StatusOK, code)

		// Action
		_, listed := call(t, fakes, imperva.REST.Host(), "id-a", imperva.APIKey("id-a"), "GET", "/certificates-ui/v3/certificates?extSiteId=101&certType=CUSTOM_CERT", "")

		// Assert
		data := listed["data"].([]any)
		require.Len(t, data, 1)
		require.Equal(t, "ECC", data[0].(map[string]any)["authType"])
		require.Equal(t, true, data[0].(map[string]any)["customCertificateDetails"].(map[string]any)["hasMismatchSite"])
	})

	t.Run("should refuse a certificate that covers none of the site's domains", func(t *testing.T) {
		// Setup
		fakes, cp := newAccount(t, "id-b")
		cp.Seed(t, imperva.WithSite("102", "shop", "shop.test"))

		// Action
		code, _ := call(t, fakes, imperva.Provisioning.Host(), "id-b", imperva.APIKey("id-b"), "PUT", "/api/prov/v2/sites/102/customCertificate", upload(t, certFor(t, "other.test"), "ECC"))

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Empty(t, cp.State(t).Sites["102"].Certificates)
	})

	t.Run("should refuse a request with the wrong API key", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "id-c")

		// Action
		code, _ := call(t, fakes, imperva.REST.Host(), "id-c", "wrong", "GET", "/sites-mgmt/v3/sites?page=0&size=10", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, code)
	})
}

func TestImpervaFake_Account(t *testing.T) {
	t.Run("should forget an account's websites once both hosts' scopes are removed", func(t *testing.T) {
		// Setup
		fakes, adminURL := fakenet.ServeInProcess(t, imperva.Provisioning, imperva.REST)
		listSites := func(t *testing.T) []any {
			code, out := call(t, fakes, imperva.REST.Host(), "id-r", imperva.APIKey("id-r"), "GET", "/sites-mgmt/v3/sites", "")
			require.Equal(t, http.StatusOK, code)
			data, _ := out["data"].([]any)
			return data
		}
		t.Run("an earlier test", func(t *testing.T) {
			cp := imperva.Open(t, adminURL, "id-r")
			cp.Seed(t, imperva.WithSite("101", "shop", "shop.test"))
			require.Len(t, listSites(t), 1)
		})

		// Action
		sites := listSites(t)

		// Assert
		require.Empty(t, sites)
	})
}
