package dnsmadeeasy_test

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/dnsmadeeasy"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

func newAccount(t *testing.T, apiKey string) (*httptest.Server, *dnsmadeeasy.ControlPlane) {
	t.Helper()
	srv := fakenet.New(dnsmadeeasy.Service)
	fakes := httptest.NewServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, ""))
	fakenet.Track(t, admin.URL, dnsmadeeasy.Service.Host(), apiKey)
	return fakes, dnsmadeeasy.Open(t, admin.URL, apiKey)
}

func call(t *testing.T, fakes *httptest.Server, apiKey, secret, method, path, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = dnsmadeeasy.Service.Host()
	date := time.Now().UTC().Format(http.TimeFormat)
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(date))
	req.Header.Set("x-dnsme-apiKey", apiKey)
	req.Header.Set("x-dnsme-requestDate", date)
	req.Header.Set("x-dnsme-hmac", hex.EncodeToString(mac.Sum(nil)))
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

func TestDNSMadeEasyFake_Records(t *testing.T) {
	t.Run("should find a created TXT record by name and remove it on delete", func(t *testing.T) {
		// Setup
		fakes, dme := newAccount(t, "key-a")
		dme.Seed(t, dnsmadeeasy.WithSecretKey("secret"), dnsmadeeasy.WithZone("100", "example.test"))
		_, created := call(t, fakes, "key-a", "secret", "POST", "/V2.0/dns/managed/100/records", `{"type":"TXT","name":"_acme-challenge","value":"v","ttl":60}`)
		var rec dnsmadeeasy.Record
		require.NoError(t, json.Unmarshal([]byte(created), &rec))

		// Action
		_, listed := call(t, fakes, "key-a", "secret", "GET", "/V2.0/dns/managed/100/records?type=TXT&recordName=_acme-challenge&page=0", "")
		code, _ := call(t, fakes, "key-a", "secret", "DELETE", "/V2.0/dns/managed/100/records/"+jsonInt(rec.ID), "")

		// Assert
		require.Contains(t, listed, `"value":"v"`)
		require.Equal(t, http.StatusOK, code)
		require.Empty(t, dme.State(t).Zones["100"].Records)
	})

	t.Run("should refuse a request signed with the wrong secret", func(t *testing.T) {
		// Setup
		fakes, dme := newAccount(t, "key-b")
		dme.Seed(t, dnsmadeeasy.WithSecretKey("secret"))

		// Action
		code, _ := call(t, fakes, "key-b", "wrong", "GET", "/V2.0/dns/managed/", "")

		// Assert
		require.Equal(t, http.StatusForbidden, code)
	})
}

func jsonInt(n int) string { raw, _ := json.Marshal(n); return string(raw) }
