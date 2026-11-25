package venafitpp_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/fakes/venafitpp"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newServer(t *testing.T, scope string) (*httptest.Server, *venafitpp.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, venafitpp.Service)
	fakenet.Track(t, adminURL, venafitpp.Service.Host(), scope)
	return fakes, venafitpp.Open(t, adminURL, scope)
}

func call(t *testing.T, fakes *httptest.Server, token, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = venafitpp.Service.Host()
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	return res.StatusCode, out
}

func login(t *testing.T, fakes *httptest.Server) string {
	t.Helper()
	status, out := call(t, fakes, "", "POST", "/s1/vedauth/authorize/oauth", `{"client_id":"infisical","username":"bob","password":"`+venafitpp.Password("bob")+`"}`)
	require.Equal(t, http.StatusOK, status)
	return out["access_token"].(string)
}

func TestVenafiTppFake_Certificates(t *testing.T) {
	t.Run("should answer 202 on the first retrieve and the certificate on the next", func(t *testing.T) {
		// Setup
		fakes, _ := newServer(t, "s1")
		token := login(t, fakes)
		_, req := call(t, fakes, token, "POST", "/s1/vedsdk/certificates/request", `{"PolicyDN":"\\VED\\Policy\\Certs","ObjectName":"a.test","PKCS10":`+jsonString(issuer.TestCSR(t, "a.test"))+`}`)
		body := `{"CertificateDN":` + jsonString(req["CertificateDN"].(string)) + `,"Format":"Base64","IncludeChain":true}`
		first, _ := call(t, fakes, token, "POST", "/s1/vedsdk/certificates/retrieve", body)

		// Action
		second, out := call(t, fakes, token, "POST", "/s1/vedsdk/certificates/retrieve", body)

		// Assert
		require.Equal(t, http.StatusAccepted, first)
		require.Equal(t, http.StatusOK, second)
		require.NotEmpty(t, out["CertificateData"])
	})

	t.Run("should refuse a revoked token", func(t *testing.T) {
		// Setup
		fakes, tpp := newServer(t, "s1")
		token := login(t, fakes)
		status, _ := call(t, fakes, token, "GET", "/s1/vedauth/revoke/token", "")
		require.Equal(t, http.StatusOK, status)

		// Action
		status, _ = call(t, fakes, token, "POST", "/s1/vedsdk/certificates/retrieve", `{}`)

		// Assert
		require.Equal(t, http.StatusUnauthorized, status)
		tpp.ExpectEvent[venafitpp.TokenRevoked](t, func(e venafitpp.TokenRevoked) bool { return e.Username == "bob" })
	})

	t.Run("should refuse a wrong password", func(t *testing.T) {
		// Setup
		fakes, _ := newServer(t, "s1")

		// Action
		status, out := call(t, fakes, "", "POST", "/s1/vedauth/authorize/oauth", `{"client_id":"infisical","username":"bob","password":"nope"}`)

		// Assert
		require.Equal(t, http.StatusBadRequest, status)
		require.Equal(t, "invalid_grant", out["error"])
	})
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
