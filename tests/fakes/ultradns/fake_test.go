package ultradns_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/ultradns"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const rrset = "/v1/zones/example.test./rrsets/TXT/_acme-challenge.www.example.test."

func newAccount(t *testing.T, user string) (*httptest.Server, *ultradns.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, ultradns.Service)
	fakenet.Track(t, adminURL, ultradns.Service.Host(), user)
	cp := ultradns.Open(t, adminURL, user)
	cp.Seed(t, ultradns.WithPassword("pw"), ultradns.WithZone("example.test"))
	return fakes, cp
}

func do(t *testing.T, fakes *httptest.Server, req *http.Request) (int, string) {
	t.Helper()
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

func grant(t *testing.T, fakes *httptest.Server, user, password string) (int, map[string]any) {
	t.Helper()
	form := url.Values{"grant_type": {"password"}, "username": {user}, "password": {password}}
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, fakes.URL+"/v1/authorization/token", strings.NewReader(form.Encode()))
	require.NoError(t, err)
	req.Host = ultradns.Service.Host()
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	code, body := do(t, fakes, req)
	var out map[string]any
	require.NoError(t, json.Unmarshal([]byte(body), &out))
	return code, out
}

func call(t *testing.T, fakes *httptest.Server, token, method, path, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = ultradns.Service.Host()
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	return do(t, fakes, req)
}

func TestUltraDNSFake_Token(t *testing.T) {
	t.Run("should issue a bearer token for the right password", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "user-a")

		// Action
		code, out := grant(t, fakes, "user-a", "pw")

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, "Bearer", out["tokenType"])
		require.NotEmpty(t, out["accessToken"])
		require.NotEmpty(t, out["refreshToken"])
	})

	t.Run("should refuse a wrong password with invalid_grant", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "user-b")

		// Action
		code, out := grant(t, fakes, "user-b", "wrong")

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Equal(t, "invalid_grant", out["error"])
		require.InDelta(t, 60001, out["errorCode"], 0)
	})

	t.Run("should refuse a token it did not issue", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "user-c")

		// Action
		code, _ := call(t, fakes, "forged.user-c", http.MethodGet, "/v3/zones", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, code)
	})
}

func TestUltraDNSFake_RRSets(t *testing.T) {
	t.Run("should create, read, update and delete a TXT RRset", func(t *testing.T) {
		// Setup
		fakes, cp := newAccount(t, "user-d")
		_, tok := grant(t, fakes, "user-d", "pw")
		token := tok["accessToken"].(string)

		// Action
		created, createdBody := call(t, fakes, token, http.MethodPost, rrset, `{"ttl":60,"rdata":["\"a\""]}`)
		updated, _ := call(t, fakes, token, http.MethodPut, rrset, `{"ttl":60,"rdata":["\"a\"","\"b\""]}`)
		read, readBody := call(t, fakes, token, http.MethodGet, rrset, "")
		deleted, _ := call(t, fakes, token, http.MethodDelete, rrset, "")
		gone, goneBody := call(t, fakes, token, http.MethodGet, rrset, "")

		// Assert
		require.Equal(t, http.StatusCreated, created)
		require.JSONEq(t, `{"message":"Successful"}`, createdBody)
		require.Equal(t, http.StatusOK, updated)
		require.Equal(t, http.StatusOK, read)
		var got struct {
			ZoneName string `json:"zoneName"`
			RRSets   []struct {
				OwnerName string   `json:"ownerName"`
				RRType    string   `json:"rrtype"`
				TTL       int      `json:"ttl"`
				RData     []string `json:"rdata"`
			} `json:"rrSets"`
		}
		require.NoError(t, json.Unmarshal([]byte(readBody), &got))
		require.Equal(t, "example.test.", got.ZoneName)
		require.Len(t, got.RRSets, 1)
		require.Equal(t, "_acme-challenge.www.example.test.", got.RRSets[0].OwnerName)
		require.Equal(t, "TXT (16)", got.RRSets[0].RRType)
		require.Equal(t, []string{`"a"`, `"b"`}, got.RRSets[0].RData)
		require.Equal(t, http.StatusNoContent, deleted)
		require.Equal(t, http.StatusNotFound, gone)
		require.JSONEq(t, `[{"errorCode":70002,"errorMessage":"Data not found."}]`, goneBody)
		cp.ExpectEvent[ultradns.RecordCreated](t, nil)
		cp.ExpectEvent[ultradns.RecordDeleted](t, nil)
	})

	t.Run("should refuse to create an RRset that already exists", func(t *testing.T) {
		// Setup
		fakes, cp := newAccount(t, "user-e")
		_, tok := grant(t, fakes, "user-e", "pw")
		token := tok["accessToken"].(string)
		call(t, fakes, token, http.MethodPost, rrset, `{"ttl":60,"rdata":["a"]}`)

		// Action
		code, body := call(t, fakes, token, http.MethodPost, rrset, `{"ttl":60,"rdata":["b"]}`)

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.JSONEq(t, `[{"errorCode":2111,"errorMessage":"Resource Record of type 16 with these attributes already exists in the system."}]`, body)
		require.Equal(t, []string{"a"}, cp.State(t).Zones["example.test."].RRSets["TXT/_acme-challenge.www.example.test."].RData)
	})

	t.Run("should answer 404 for a zone the user does not have", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "user-f")
		_, tok := grant(t, fakes, "user-f", "pw")

		// Action
		code, body := call(t, fakes, tok["accessToken"].(string), http.MethodPost, "/v1/zones/other.test./rrsets/TXT/a.other.test.", `{"ttl":60,"rdata":["a"]}`)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.JSONEq(t, `[{"errorCode":1801,"errorMessage":"Zone does not exist in the system."}]`, body)
	})

	t.Run("should list the user's zones", func(t *testing.T) {
		// Setup
		fakes, _ := newAccount(t, "user-g")
		_, tok := grant(t, fakes, "user-g", "pw")

		// Action
		code, body := call(t, fakes, tok["accessToken"].(string), http.MethodGet, "/v3/zones?q=zone_type:PRIMARY&limit=1000", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		var got struct {
			Zones []struct {
				Properties struct {
					Name string `json:"name"`
					Type string `json:"type"`
				} `json:"properties"`
			} `json:"zones"`
		}
		require.NoError(t, json.Unmarshal([]byte(body), &got))
		require.Len(t, got.Zones, 1)
		require.Equal(t, "example.test.", got.Zones[0].Properties.Name)
		require.Equal(t, "PRIMARY", got.Zones[0].Properties.Type)
	})
}
