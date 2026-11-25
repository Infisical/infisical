package godaddy_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newAccount(t *testing.T, key string) (*httptest.Server, string, *godaddy.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, godaddy.Service)
	fakenet.Track(t, adminURL, godaddy.Service.Host(), key)
	return fakes, adminURL, godaddy.Open(t, adminURL, key)
}

func call(t *testing.T, fakes *httptest.Server, key, secret, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = godaddy.Service.Host()
	req.Header.Set("Authorization", "sso-key "+key+":"+secret)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return res.StatusCode, out
}

func certificateRequest(t *testing.T, name string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"commonName": name, "csr": issuer.TestCSR(t, name), "period": 1, "productType": "DV_SSL"})
	require.NoError(t, err)
	return string(raw)
}

func TestGoDaddyFake_Certificates(t *testing.T) {
	t.Run("should issue an order once its _dnsauth TXT record holds the domain token", func(t *testing.T) {
		// Setup
		fakes, admin, gd := newAccount(t, "key-a")
		secret := godaddy.APISecret("key-a")
		_, placed := call(t, fakes, "key-a", secret, "POST", "/v1/certificates", certificateRequest(t, "a.test"))
		id := placed["certificateId"].(string)
		_, before := call(t, fakes, "key-a", secret, "GET", "/v1/certificates/"+id, "")
		fakenet.SetTXT(t, admin, "_dnsauth.a.test", gd.State(t).Certificates[id].DomainToken)

		// Action
		_, after := call(t, fakes, "key-a", secret, "GET", "/v1/certificates/"+id, "")

		// Assert
		require.Equal(t, "PENDING_ISSUANCE", before["status"])
		require.Equal(t, "ISSUED", after["status"])
		status, bundle := call(t, fakes, "key-a", secret, "GET", "/v1/certificates/"+id+"/download", "")
		require.Equal(t, http.StatusOK, status)
		require.Contains(t, bundle["pems"].(map[string]any)["certificate"], "BEGIN CERTIFICATE")
	})

	t.Run("should refuse a key presented with the wrong secret", func(t *testing.T) {
		// Setup
		fakes, _, _ := newAccount(t, "key-b")

		// Action
		status, _ := call(t, fakes, "key-b", "wrong", "GET", "/v1/certificates/x", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, status)
	})

	t.Run("should answer 404 for a certificate that does not exist", func(t *testing.T) {
		// Setup
		fakes, _, _ := newAccount(t, "key-c")

		// Action
		status, body := call(t, fakes, "key-c", godaddy.APISecret("key-c"), "GET", "/v1/certificates/infisical-connection-validation", "")

		// Assert
		require.Equal(t, http.StatusNotFound, status)
		require.Equal(t, "NOT_FOUND", body["code"])
	})
}
