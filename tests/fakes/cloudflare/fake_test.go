package cloudflare_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newAccount(t *testing.T, token string) (*httptest.Server, *cloudflare.ControlPlane) {
	t.Helper()
	srv := fakenet.New(cloudflare.Service)
	fakes := httptest.NewServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, ""))
	fakenet.Track(t, admin.URL, cloudflare.Service.Host(), token)
	return fakes, cloudflare.Open(t, admin.URL, token)
}

func call(t *testing.T, fakes *httptest.Server, token, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = cloudflare.Service.Host()
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	require.NoError(t, json.Unmarshal(raw, &out))
	return res.StatusCode, out
}

func TestCloudflareFake_DNSRecords(t *testing.T) {
	t.Run("should list a created TXT record by name and content, and drop it on delete", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-a")
		cf.Seed(t, cloudflare.WithZone("zone1"))
		_, created := call(t, fakes, "tok-a", "POST", "/client/v4/zones/zone1/dns_records", `{"type":"TXT","name":"_acme-challenge.a.test","content":"v","ttl":60}`)
		id := created["result"].(map[string]any)["id"].(string)

		// Action
		_, listed := call(t, fakes, "tok-a", "GET", "/client/v4/zones/zone1/dns_records?type=TXT&name=_acme-challenge.a.test&content=v", "")
		code, _ := call(t, fakes, "tok-a", "DELETE", "/client/v4/zones/zone1/dns_records/"+id, "")

		// Assert
		require.Len(t, listed["result"], 1)
		require.Equal(t, http.StatusOK, code)
		require.Empty(t, cf.State(t).Zones["zone1"])
	})

	t.Run("should refuse a record for a zone the token cannot reach", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-b")

		// Action
		code, _ := call(t, fakes, "tok-b", "POST", "/client/v4/zones/missing/dns_records", `{"type":"TXT","name":"x","content":"v"}`)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Empty(t, cf.State(t).Zones)
	})

	t.Run("should refuse the account lookup for another account id", func(t *testing.T) {
		// Setup
		fakes, cf := newAccount(t, "tok-c")
		cf.Seed(t, cloudflare.WithAccount("acct-1"))

		// Action
		ok, _ := call(t, fakes, "tok-c", "GET", "/client/v4/accounts/acct-1", "")
		other, _ := call(t, fakes, "tok-c", "GET", "/client/v4/accounts/acct-2", "")

		// Assert
		require.Equal(t, http.StatusOK, ok)
		require.Equal(t, http.StatusForbidden, other)
	})
}
