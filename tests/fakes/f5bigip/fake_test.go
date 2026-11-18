package f5bigip_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/f5bigip"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newBigIP(t *testing.T, user string) (*httptest.Server, *f5bigip.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, f5bigip.Service)
	fakenet.Track(t, adminURL, f5bigip.Service.Host(), user)
	return fakes, f5bigip.Open(t, adminURL, user)
}

func call(t *testing.T, fakes *httptest.Server, token, method, path, contentRange, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = f5bigip.Service.Host()
	if token != "" {
		req.Header.Set("X-F5-Auth-Token", token)
	}
	if contentRange != "" {
		req.Header.Set("Content-Range", contentRange)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return res.StatusCode, out
}

func login(t *testing.T, fakes *httptest.Server, user string) string {
	t.Helper()
	code, out := call(t, fakes, "", "POST", "/mgmt/shared/authn/login", "", `{"username":"`+user+`","password":"`+f5bigip.Password(user)+`","loginProviderName":"tmos"}`)
	require.Equal(t, http.StatusOK, code)
	return out["token"].(map[string]any)["token"].(string)
}

func TestF5BigIpFake_SSLFiles(t *testing.T) {
	t.Run("should install an ssl-cert from a file uploaded in two chunks", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-a")
		tok := login(t, fakes, "u-a")
		call(t, fakes, tok, "POST", "/mgmt/shared/file-transfer/uploads/web.crt", "0-3/8", "PEM-")
		call(t, fakes, tok, "POST", "/mgmt/shared/file-transfer/uploads/web.crt", "4-7/8", "DATA")

		// Action
		code, _ := call(t, fakes, tok, "POST", "/mgmt/tm/sys/file/ssl-cert", "", `{"name":"web","partition":"Common","sourcePath":"file:`+f5bigip.DownloadsDir+`/web.crt"}`)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, "PEM-DATA", bigip.State(t).SSLCerts["/Common/web"])
	})

	t.Run("should answer 404 when patching an ssl-key that does not exist", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-b")
		tok := login(t, fakes, "u-b")
		call(t, fakes, tok, "POST", "/mgmt/shared/file-transfer/uploads/web.key", "0-2/3", "KEY")

		// Action
		code, _ := call(t, fakes, tok, "PATCH", "/mgmt/tm/sys/file/ssl-key/%7ECommon%7Eweb", "", `{"sourcePath":"file:`+f5bigip.DownloadsDir+`/web.key"}`)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Empty(t, bigip.State(t).SSLKeys)
	})

	t.Run("should record the installed objects when the config is saved", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-c")
		tok := login(t, fakes, "u-c")
		call(t, fakes, tok, "POST", "/mgmt/shared/file-transfer/uploads/web.key", "0-2/3", "KEY")
		call(t, fakes, tok, "POST", "/mgmt/tm/sys/file/ssl-key", "", fmt.Sprintf(`{"name":"web","partition":"Common","sourcePath":"file:%s/web.key"}`, f5bigip.DownloadsDir))

		// Action
		code, _ := call(t, fakes, tok, "POST", "/mgmt/tm/sys/config", "", `{"command":"save"}`)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, []string{"ssl-key /Common/web"}, bigip.State(t).Saved)
	})
}
