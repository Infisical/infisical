package netscaler_test

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/netscaler"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newADC(t *testing.T, user string) (*httptest.Server, *netscaler.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, netscaler.Service)
	fakenet.Track(t, adminURL, netscaler.Service.Host(), user)
	return fakes, netscaler.Open(t, adminURL, user)
}

func call(t *testing.T, fakes *httptest.Server, session, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = netscaler.Service.Host()
	req.Header.Set("Content-Type", "application/json")
	if session != "" {
		req.Header.Set("Cookie", "NITRO_AUTH_TOKEN="+session)
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
	code, out := call(t, fakes, "", "POST", "/nitro/v1/config/login", `{"login":{"username":"`+user+`","password":"`+netscaler.Password(user)+`"}}`)
	require.Equal(t, http.StatusCreated, code)
	return out["sessionid"].(string)
}

func upload(t *testing.T, fakes *httptest.Server, session, name, content string) {
	t.Helper()
	code, _ := call(t, fakes, session, "POST", "/nitro/v1/config/systemfile?override=yes",
		`{"systemfile":{"filename":"`+name+`","filelocation":"/nsconfig/ssl","filecontent":"`+base64.StdEncoding.EncodeToString([]byte(content))+`","fileencoding":"BASE64"}}`)
	require.Equal(t, http.StatusCreated, code)
}

func TestNetScalerFake_CertKeys(t *testing.T) {
	t.Run("should create a certkey from uploaded files and hold it in the saved config", func(t *testing.T) {
		// Setup
		fakes, adc := newADC(t, "u-a")
		s := login(t, fakes, "u-a")
		upload(t, fakes, s, "web.cer", "cert")
		upload(t, fakes, s, "web.key", "key")
		code, _ := call(t, fakes, s, "POST", "/nitro/v1/config/sslcertkey", `{"sslcertkey":{"certkey":"web","cert":"/nsconfig/ssl/web.cer","key":"/nsconfig/ssl/web.key"}}`)
		require.Equal(t, http.StatusCreated, code)

		// Action
		code, _ = call(t, fakes, s, "POST", "/nitro/v1/config/nsconfig?action=save", `{"nsconfig":{}}`)

		// Assert
		require.Equal(t, http.StatusOK, code)
		state := adc.State(t)
		require.Equal(t, []string{"web"}, state.Saved)
		require.Equal(t, "cert", state.Files["/nsconfig/ssl/web.cer"])
	})

	t.Run("should answer errorcode 1540 when updating a certkey that does not exist", func(t *testing.T) {
		// Setup
		fakes, _ := newADC(t, "u-b")
		s := login(t, fakes, "u-b")

		// Action
		code, out := call(t, fakes, s, "POST", "/nitro/v1/config/sslcertkey?action=update", `{"sslcertkey":{"certkey":"web","cert":"/nsconfig/ssl/web.cer","key":"/nsconfig/ssl/web.key"}}`)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.EqualValues(t, 1540, out["errorcode"])
	})

	t.Run("should refuse a session token it did not issue", func(t *testing.T) {
		// Setup
		fakes, _ := newADC(t, "u-c")

		// Action
		code, _ := call(t, fakes, "u-c.forged", "GET", "/nitro/v1/config/sslcertkey", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, code)
	})
}

func TestNetScalerFake_VServerBindings(t *testing.T) {
	certKey := func(t *testing.T, fakes *httptest.Server, s string) {
		t.Helper()
		upload(t, fakes, s, "web.cer", "cert")
		upload(t, fakes, s, "web.key", "key")
		code, _ := call(t, fakes, s, "POST", "/nitro/v1/config/sslcertkey", `{"sslcertkey":{"certkey":"web","cert":"/nsconfig/ssl/web.cer","key":"/nsconfig/ssl/web.key"}}`)
		require.Equal(t, http.StatusCreated, code)
	}
	bind := `{"sslvserver_sslcertkey_binding":{"vservername":"vs-web","certkeyname":"web"}}`

	t.Run("should bind a certkey to a seeded vserver", func(t *testing.T) {
		// Setup
		fakes, adc := newADC(t, "u-d")
		adc.Seed(t, netscaler.VServer("vs-web"))
		s := login(t, fakes, "u-d")
		certKey(t, fakes, s)

		// Action
		code, _ := call(t, fakes, s, "PUT", "/nitro/v1/config/sslvserver_sslcertkey_binding", bind)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, []string{"web"}, adc.State(t).VServers["vs-web"])
	})

	t.Run("should refuse deleting a certkey still bound to a vserver", func(t *testing.T) {
		// Setup
		fakes, adc := newADC(t, "u-e")
		adc.Seed(t, netscaler.VServer("vs-web"))
		s := login(t, fakes, "u-e")
		certKey(t, fakes, s)
		call(t, fakes, s, "PUT", "/nitro/v1/config/sslvserver_sslcertkey_binding", bind)

		// Action
		code, out := call(t, fakes, s, "DELETE", "/nitro/v1/config/sslcertkey/web?args=deletefromdevice:true", "")

		// Assert
		require.Equal(t, 599, code)
		require.Equal(t, "Certificate is bound to a vserver", out["message"])
		require.Contains(t, adc.State(t).CertKeys, "web")
	})

	t.Run("should delete a certkey once it is unbound", func(t *testing.T) {
		// Setup
		fakes, adc := newADC(t, "u-f")
		adc.Seed(t, netscaler.VServer("vs-web"))
		s := login(t, fakes, "u-f")
		certKey(t, fakes, s)
		call(t, fakes, s, "PUT", "/nitro/v1/config/sslvserver_sslcertkey_binding", bind)
		code, _ := call(t, fakes, s, "DELETE", "/nitro/v1/config/sslvserver_sslcertkey_binding/vs-web?args=certkeyname:web", "")
		require.Equal(t, http.StatusOK, code)

		// Action
		code, _ = call(t, fakes, s, "DELETE", "/nitro/v1/config/sslcertkey/web?args=deletefromdevice:true", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		state := adc.State(t)
		require.Empty(t, state.VServers["vs-web"])
		require.Empty(t, state.CertKeys)
	})
}
