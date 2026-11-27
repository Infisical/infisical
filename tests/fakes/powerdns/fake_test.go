package powerdns_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/powerdns"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const zone = "/api/v1/servers/localhost/zones/example.test."

func newServer(t *testing.T, apiKey string) (*httptest.Server, *powerdns.ControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, powerdns.Service)
	fakenet.Track(t, adminURL, powerdns.Service.Host(), apiKey)
	cp := powerdns.Open(t, adminURL, apiKey)
	cp.Seed(t, powerdns.WithKeyAccepted(), powerdns.WithZone("example.test"))
	return fakes, cp
}

func call(t *testing.T, fakes *httptest.Server, apiKey, method, path, body string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = powerdns.Service.Host()
	req.Header.Set("X-API-Key", apiKey)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(raw)
}

func TestPowerDNSFake_RRSets(t *testing.T) {
	t.Run("should replace an RRset with 204 and return it filtered by name and type", func(t *testing.T) {
		// Setup
		fakes, cp := newServer(t, "key-a")

		// Action
		patched, _ := call(t, fakes, "key-a", http.MethodPatch, zone,
			`{"rrsets":[{"name":"_acme-challenge.www.example.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[{"content":"\"token\"","disabled":false}]}]}`)
		read, body := call(t, fakes, "key-a", http.MethodGet, zone+"?rrset_name=_acme-challenge.www.example.test.&rrset_type=TXT", "")

		// Assert
		require.Equal(t, http.StatusNoContent, patched)
		require.Equal(t, http.StatusOK, read)
		var got struct {
			ID     string           `json:"id"`
			RRSets []powerdns.RRSet `json:"rrsets"`
		}
		require.NoError(t, json.Unmarshal([]byte(body), &got))
		require.Equal(t, "example.test.", got.ID)
		require.Equal(t, []powerdns.RRSet{{Name: "_acme-challenge.www.example.test.", Type: "TXT", TTL: 60, Records: []powerdns.Record{{Content: `"token"`}}, Comments: []any{}}}, got.RRSets)
		cp.ExpectEvent[powerdns.RecordCreated](t, func(e powerdns.RecordCreated) bool { return e.Content == `"token"` })
	})

	t.Run("should emit a creation event only for the value a PATCH commits when it replaces the same RRset twice", func(t *testing.T) {
		// Setup
		fakes, cp := newServer(t, "key-a")

		// Action
		patched, _ := call(t, fakes, "key-a", http.MethodPatch, zone, `{"rrsets":[
			{"name":"_acme-challenge.www.example.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[{"content":"\"intermediate\"","disabled":false}]},
			{"name":"_acme-challenge.www.example.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[{"content":"\"committed\"","disabled":false}]}]}`)
		_, body := call(t, fakes, "key-a", http.MethodGet, zone+"?rrset_name=_acme-challenge.www.example.test.&rrset_type=TXT", "")

		// Assert
		require.Equal(t, http.StatusNoContent, patched)
		require.Contains(t, body, `committed`)
		require.NotContains(t, body, `intermediate`)
		cp.ExpectEvent[powerdns.RecordCreated](t, func(e powerdns.RecordCreated) bool { return e.Content == `"committed"` })
		cp.ExpectNoEvent[powerdns.RecordCreated](t, func(e powerdns.RecordCreated) bool { return e.Content == `"intermediate"` })
	})

	t.Run("should delete an RRset", func(t *testing.T) {
		// Setup
		fakes, cp := newServer(t, "key-b")
		call(t, fakes, "key-b", http.MethodPatch, zone, `{"rrsets":[{"name":"a.example.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[{"content":"\"x\"","disabled":false}]}]}`)

		// Action
		code, _ := call(t, fakes, "key-b", http.MethodPatch, zone, `{"rrsets":[{"name":"a.example.test.","type":"TXT","changetype":"DELETE"}]}`)

		// Assert
		require.Equal(t, http.StatusNoContent, code)
		require.Empty(t, cp.State(t).Zones["example.test."].RRSets)
		cp.ExpectEvent[powerdns.RecordDeleted](t, func(e powerdns.RecordDeleted) bool { return e.Content == `"x"` })
	})

	t.Run("should refuse with 422 a change the server cannot apply", func(t *testing.T) {
		rows := []struct{ name, rrset, message string }{
			{"when the TXT content is not quoted", `{"name":"a.example.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[{"content":"x","disabled":false}]}`,
				`Record a.example.test./TXT 'x': Parsing record content (try 'pdnsutil check-zone'): Data field in DNS should start with quote (") at position 0 of 'x'`},
			{"when the name is out of zone", `{"name":"a.other.test.","type":"TXT","ttl":60,"changetype":"REPLACE","records":[]}`, "RRset a.other.test. IN TXT: Name is out of zone"},
			{"when the name is not canonical", `{"name":"a.example.test","type":"TXT","ttl":60,"changetype":"REPLACE","records":[]}`, "DNS Name 'a.example.test' is not canonical"},
			{"when the changetype is missing", `{"name":"a.example.test.","type":"TXT","ttl":60,"records":[]}`, "Key 'changetype' not present or not a String"},
		}
		for _, row := range rows {
			t.Run(row.name, func(t *testing.T) {
				// Setup
				fakes, cp := newServer(t, "key-c")

				// Action
				code, body := call(t, fakes, "key-c", http.MethodPatch, zone, `{"rrsets":[`+row.rrset+`]}`)

				// Assert
				require.Equal(t, http.StatusUnprocessableEntity, code)
				var got map[string]string
				require.NoError(t, json.Unmarshal([]byte(body), &got))
				require.Equal(t, row.message, got["error"])
				require.Empty(t, cp.State(t).Zones["example.test."].RRSets)
			})
		}
	})

	t.Run("should answer 404 for a zone it does not serve", func(t *testing.T) {
		// Setup
		fakes, _ := newServer(t, "key-d")

		// Action
		code, body := call(t, fakes, "key-d", http.MethodGet, "/api/v1/servers/localhost/zones/other.test.", "")

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.JSONEq(t, `{"error":"Could not find domain 'other.test.'"}`, body)
	})

	t.Run("should refuse a key the server does not accept", func(t *testing.T) {
		// Setup
		fakes, adminURL := fakenet.ServeInProcess(t, powerdns.Service)
		powerdns.Open(t, adminURL, "key-e")

		// Action
		code, _ := call(t, fakes, "key-e", http.MethodGet, "/api/v1/servers/localhost/zones", "")

		// Assert
		require.Equal(t, http.StatusUnauthorized, code)
	})
}
