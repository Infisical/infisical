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

func TestF5BigIpFake_ClientSSLProfiles(t *testing.T) {
	t.Run("should refuse deleting an ssl-cert a Client SSL profile still uses", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-d")
		bigip.Seed(t, map[string]any{"sslCerts": map[string]string{"/Common/web": "PEM"}},
			f5bigip.ClientSSLProfile("/Common/web-ssl", f5bigip.CertKeyChainEntry{Name: "web", Cert: "/Common/web", Key: "/Common/web"}))
		tok := login(t, fakes, "u-d")

		// Action
		code, out := call(t, fakes, tok, "DELETE", "/mgmt/tm/sys/file/ssl-cert/~Common~web", "", "")

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Contains(t, out["message"], "in use by Client SSL profile (/Common/web-ssl)")
		require.Equal(t, "PEM", bigip.State(t).SSLCerts["/Common/web"])
	})

	t.Run("should replace a profile's cert-key-chain and then allow deleting the released ssl-cert", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-e")
		other := f5bigip.CertKeyChainEntry{Name: "default", Cert: "/Common/default.crt", Key: "/Common/default.key"}
		bigip.Seed(t, map[string]any{"sslCerts": map[string]string{"/Common/web": "PEM"}},
			f5bigip.ClientSSLProfile("/Common/web-ssl", other, f5bigip.CertKeyChainEntry{Name: "web", Cert: "/Common/web", Key: "/Common/web"}))
		tok := login(t, fakes, "u-e")
		code, _ := call(t, fakes, tok, "PATCH", "/mgmt/tm/ltm/profile/client-ssl/~Common~web-ssl", "", `{"certKeyChain":[{"name":"default","cert":"/Common/default.crt","key":"/Common/default.key"}]}`)
		require.Equal(t, http.StatusOK, code)

		// Action
		code, _ = call(t, fakes, tok, "DELETE", "/mgmt/tm/sys/file/ssl-cert/~Common~web", "", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		state := bigip.State(t)
		require.Equal(t, []f5bigip.CertKeyChainEntry{other}, state.ClientSSLProfiles["/Common/web-ssl"].CertKeyChain)
		require.NotContains(t, state.SSLCerts, "/Common/web")
	})

	t.Run("should list Client SSL profiles with their cert-key-chain", func(t *testing.T) {
		// Setup
		fakes, bigip := newBigIP(t, "u-f")
		bigip.Seed(t, f5bigip.ClientSSLProfile("/Common/web-ssl", f5bigip.CertKeyChainEntry{Name: "web", Cert: "/Common/web"}))
		tok := login(t, fakes, "u-f")

		// Action
		code, out := call(t, fakes, tok, "GET", "/mgmt/tm/ltm/profile/client-ssl?$select=name,partition,certKeyChain", "", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		items := out["items"].([]any)
		require.Len(t, items, 1)
		item := items[0].(map[string]any)
		require.Equal(t, "Common", item["partition"])
		require.Equal(t, "/Common/web", item["certKeyChain"].([]any)[0].(map[string]any)["cert"])
	})
}
