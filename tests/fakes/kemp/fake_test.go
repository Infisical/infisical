package kemp_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/kemp"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newLoadMaster(t *testing.T, user string) (*httptest.Server, *kemp.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, kemp.Service)
	fakenet.Track(t, adminURL, kemp.Service.Host(), user)
	return fakes, kemp.Open(t, adminURL, user)
}

func call(t *testing.T, fakes *httptest.Server, user, method, path, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = kemp.Service.Host()
	req.SetBasicAuth(user, kemp.Password(user))
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

const bundle = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----\n-----BEGIN PRIVATE KEY-----\ny\n-----END PRIVATE KEY-----\n"

func TestKempFake_Certificates(t *testing.T) {
	t.Run("should list a certificate after it is added", func(t *testing.T) {
		// Setup
		fakes, _ := newLoadMaster(t, "u-a")
		call(t, fakes, "u-a", "POST", "/access/addcert?cert=web", bundle)

		// Action
		code, body := call(t, fakes, "u-a", "GET", "/access/listcert", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Contains(t, body, `<Response stat="200" code="ok"><Success><Data><cert><name>web</name>`)
	})

	t.Run("should refuse adding over an identifier in use unless asked to replace it", func(t *testing.T) {
		// Setup
		fakes, lm := newLoadMaster(t, "u-b")
		call(t, fakes, "u-b", "POST", "/access/addcert?cert=web", bundle)

		// Action
		code, body := call(t, fakes, "u-b", "POST", "/access/addcert?cert=web", bundle+"x")

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, code)
		require.Contains(t, body, "Identifier already in use")
		require.Equal(t, bundle, lm.State(t).Certificates["web"])
	})

}
