package digicert_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newAccount(t *testing.T, key string) (*httptest.Server, string, *digicert.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, digicert.Service)
	fakenet.Track(t, adminURL, digicert.Service.Host(), key)
	return fakes, adminURL, digicert.Open(t, adminURL, key)
}

func call(t *testing.T, fakes *httptest.Server, key, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+"/services/v2"+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = digicert.Service.Host()
	req.Header.Set("X-DC-DEVKEY", key)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	out := map[string]any{}
	if len(raw) > 0 {
		require.NoError(t, json.Unmarshal(raw, &out), string(raw))
	}
	return res.StatusCode, out
}

func order(t *testing.T, name string) string {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"certificate":    map[string]any{"common_name": name, "csr": issuer.TestCSR(t, name, name)},
		"organization":   map[string]any{"id": 7},
		"order_validity": map[string]any{"days": 30},
		"dcv_method":     "dns-txt-token",
	})
	require.NoError(t, err)
	return string(raw)
}

func TestDigiCertFake_Orders(t *testing.T) {
	t.Run("should issue an order for a pre-validated domain as it is placed", func(t *testing.T) {
		// Setup
		fakes, _, dc := newAccount(t, "key-a")
		dc.Seed(t, digicert.WithOrganization(7), digicert.WithValidatedDomain("ok.test"))

		// Action
		status, out := call(t, fakes, "key-a", "POST", "/order/certificate/ssl_plus", order(t, "www.ok.test"))

		// Assert
		require.Equal(t, http.StatusCreated, status)
		certID := strconv.Itoa(int(out["certificate_id"].(float64)))
		req, _ := http.NewRequest("GET", fakes.URL+"/services/v2/certificate/"+certID+"/download/format/pem_all", nil)
		req.Host = digicert.Service.Host()
		req.Header.Set("X-DC-DEVKEY", "key-a")
		res, err := fakes.Client().Do(req)
		require.NoError(t, err)
		body, _ := io.ReadAll(res.Body)
		require.Equal(t, 2, strings.Count(string(body), "BEGIN CERTIFICATE"))
	})

	t.Run("should keep an order pending until its _dnsauth TXT record holds the random value", func(t *testing.T) {
		// Setup
		fakes, admin, dc := newAccount(t, "key-b")
		dc.Seed(t, digicert.WithOrganization(7))
		_, placed := call(t, fakes, "key-b", "POST", "/order/certificate/ssl_plus", order(t, "www.new.test"))
		id := strconv.Itoa(int(placed["id"].(float64)))
		_, before := call(t, fakes, "key-b", "PUT", "/order/certificate/"+id+"/check-dcv", "")
		fakenet.SetTXT(t, admin, "_dnsauth.www.new.test", placed["dcv_random_value"].(string))

		// Action
		_, after := call(t, fakes, "key-b", "PUT", "/order/certificate/"+id+"/check-dcv", "")

		// Assert
		require.Equal(t, "pending", before["order_status"])
		require.Equal(t, "issued", after["order_status"])
		require.NotNil(t, after["certificate_id"])
	})

	t.Run("should refuse an order under an organization the account does not have", func(t *testing.T) {
		// Setup
		fakes, _, _ := newAccount(t, "key-c")

		// Action
		status, out := call(t, fakes, "key-c", "POST", "/order/certificate/ssl_plus", order(t, "a.test"))

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Contains(t, out["errors"].([]any)[0].(map[string]any)["code"], "invalid_organization")
	})
}
