package nutanix_test

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/nutanix"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newPrism(t *testing.T, key string) (*httptest.Server, *nutanix.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, nutanix.Service)
	fakenet.Track(t, adminURL, nutanix.Service.Host(), key)
	return fakes, nutanix.Open(t, adminURL, key)
}

func call(t *testing.T, fakes *httptest.Server, key, method, path, ifMatch, body string) (*http.Response, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = nutanix.Service.Host()
	req.Header.Set("X-ntnx-api-key", key)
	if ifMatch != "" {
		req.Header.Set("If-Match", ifMatch)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return res, out
}

func certBody() string {
	b64 := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	return `{"privateKeyAlgorithm":"RSA_2048","publicCertificate":"` + b64("-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----") +
		`","privateKey":"` + b64("key") + `","caChain":"` + b64("chain") + `"}`
}

func TestNutanixFake_SSLCertificate(t *testing.T) {
	t.Run("should replace the certificate when the PUT carries the current ETag", func(t *testing.T) {
		// Setup
		fakes, pc := newPrism(t, "key-a")
		pc.Seed(t, nutanix.WithCluster("c1", "prod"))
		got, _ := call(t, fakes, "key-a", "GET", "/api/clustermgmt/v4.2/config/clusters/c1/ssl-certificate", "", "")

		// Action
		res, out := call(t, fakes, "key-a", "PUT", "/api/clustermgmt/v4.2/config/clusters/c1/ssl-certificate", got.Header.Get("ETag"), certBody())

		// Assert
		require.Equal(t, http.StatusAccepted, res.StatusCode)
		taskID := out["data"].(map[string]any)["extId"].(string)
		_, task := call(t, fakes, "key-a", "GET", "/api/prism/v4.0/config/tasks/"+taskID, "", "")
		require.Equal(t, "SUCCEEDED", task["data"].(map[string]any)["status"])
		require.Equal(t, "chain", pc.State(t).Clusters["c1"].CaChain)
	})

	t.Run("should refuse a PUT whose If-Match is stale", func(t *testing.T) {
		// Setup
		fakes, pc := newPrism(t, "key-b")
		pc.Seed(t, nutanix.WithCluster("c1", "prod"))

		// Action
		res, _ := call(t, fakes, "key-b", "PUT", "/api/clustermgmt/v4.2/config/clusters/c1/ssl-certificate", `"c1-0"`, certBody())

		// Assert
		require.Equal(t, http.StatusPreconditionFailed, res.StatusCode)
		require.Empty(t, pc.State(t).Clusters["c1"].PublicCertificate)
	})
}
