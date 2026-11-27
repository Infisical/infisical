package azure_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const (
	dnsSubscription = "00000000-0000-0000-0000-000000000001"
	dnsZoneName     = "zone1.test"
)

var dnsZoneID = azure.DNSZoneID(dnsSubscription, "rg1", dnsZoneName)

func newDNS(t *testing.T, clientID string) (*httptest.Server, *azure.DNSControlPlane) {
	t.Helper()
	fakes, adminURL := fakenet.ServeInProcess(t, azure.DNS)
	cp := azure.OpenDNS(t, adminURL, clientID)
	cp.Seed(t, azure.WithDNSZone(dnsSubscription, "rg1", dnsZoneName))
	return fakes, cp
}

func dnsCall(t *testing.T, fakes *httptest.Server, clientID, method, path, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = azure.DNS.Host()
	req.Header.Set("Authorization", "Bearer azure-"+clientID)
	res, err := fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	var out map[string]any
	if len(raw) > 0 {
		require.NoError(t, json.Unmarshal(raw, &out), "body: %s", raw)
	}
	return res.StatusCode, out
}

func TestAzureDNSFake_RecordSets(t *testing.T) {
	t.Run("should create a TXT record set as the RecordSets Create Or Update example answers", func(t *testing.T) {
		// Setup
		fakes, cp := newDNS(t, "client-a")

		// Action
		code, body := dnsCall(t, fakes, "client-a", http.MethodPut, dnsZoneID+"/TXT/record1?api-version=2018-05-01",
			`{"properties":{"metadata":{"key1":"value1"},"TTL":3600,"TXTRecords":[{"value":["string1","string2"]}]}}`)

		// Assert
		require.Equal(t, http.StatusCreated, code)
		require.Equal(t, dnsZoneID+"/TXT/record1", body["id"])
		require.Equal(t, "record1", body["name"])
		require.Equal(t, "Microsoft.Network/dnszones/TXT", body["type"])
		props := body["properties"].(map[string]any)
		require.Equal(t, "record1.zone1.test.", props["fqdn"])
		require.InDelta(t, 3600, props["TTL"], 0)
		require.Equal(t, []any{map[string]any{"value": []any{"string1", "string2"}}}, props["TXTRecords"])
		created := cp.ExpectEvent[azure.DNSRecordCreated](t, nil)
		require.Equal(t, []string{"string1string2"}, created.Values)
	})

	t.Run("should answer 200 when the record set already exists", func(t *testing.T) {
		// Setup
		fakes, _ := newDNS(t, "client-b")
		dnsCall(t, fakes, "client-b", http.MethodPut, dnsZoneID+"/TXT/r?api-version=2018-05-01", `{"properties":{"TTL":60,"TXTRecords":[{"value":["a"]}]}}`)

		// Action
		code, body := dnsCall(t, fakes, "client-b", http.MethodPut, dnsZoneID+"/TXT/r?api-version=2018-05-01", `{"properties":{"TTL":60,"TXTRecords":[{"value":["b"]}]}}`)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, []any{map[string]any{"value": []any{"b"}}}, body["properties"].(map[string]any)["TXTRecords"])
	})

	t.Run("should delete a record set with 200, then answer 204 for it", func(t *testing.T) {
		// Setup
		fakes, cp := newDNS(t, "client-c")
		dnsCall(t, fakes, "client-c", http.MethodPut, dnsZoneID+"/TXT/r?api-version=2018-05-01", `{"properties":{"TTL":60,"TXTRecords":[{"value":["a"]}]}}`)

		// Action
		first, _ := dnsCall(t, fakes, "client-c", http.MethodDelete, dnsZoneID+"/TXT/r?api-version=2018-05-01", "")
		second, _ := dnsCall(t, fakes, "client-c", http.MethodDelete, dnsZoneID+"/TXT/r?api-version=2018-05-01", "")

		// Assert
		require.Equal(t, http.StatusOK, first)
		require.Equal(t, http.StatusNoContent, second)
		require.Empty(t, cp.State(t).Zones[strings.ToLower(dnsZoneID)].TXT)
		cp.ExpectEvent[azure.DNSRecordDeleted](t, func(e azure.DNSRecordDeleted) bool { return e.Name == "r" })
	})

	t.Run("should refuse a record set in a zone that does not exist", func(t *testing.T) {
		// Setup
		fakes, _ := newDNS(t, "client-d")

		// Action
		code, body := dnsCall(t, fakes, "client-d", http.MethodPut, azure.DNSZoneID(dnsSubscription, "rg1", "other.test")+"/TXT/r?api-version=2018-05-01", `{"properties":{"TTL":60}}`)

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Equal(t, map[string]any{"code": "ParentResourceNotFound", "message": "Can not perform requested operation on nested resource. Parent resource 'other.test' not found."}, body["error"])
	})

	t.Run("should refuse a request without an api-version", func(t *testing.T) {
		// Setup
		fakes, _ := newDNS(t, "client-e")

		// Action
		code, body := dnsCall(t, fakes, "client-e", http.MethodPut, dnsZoneID+"/TXT/r", `{"properties":{"TTL":60}}`)

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Equal(t, "MissingApiVersionParameter", body["error"].(map[string]any)["code"])
	})

	t.Run("should list the zones in a subscription, matching its path case-insensitively", func(t *testing.T) {
		// Setup
		fakes, _ := newDNS(t, "client-f")

		// Action
		code, body := dnsCall(t, fakes, "client-f", http.MethodGet, "/subscriptions/"+dnsSubscription+"/providers/Microsoft.Network/dnszones?api-version=2018-05-01", "")

		// Assert
		require.Equal(t, http.StatusOK, code)
		zones := body["value"].([]any)
		require.Len(t, zones, 1)
		require.Equal(t, dnsZoneID, zones[0].(map[string]any)["id"])
		require.Equal(t, dnsZoneName, zones[0].(map[string]any)["name"])
	})

	t.Run("should refuse to list a subscription the client cannot reach", func(t *testing.T) {
		// Setup
		fakes, _ := newDNS(t, "client-g")

		// Action
		code, body := dnsCall(t, fakes, "client-g", http.MethodGet, "/subscriptions/00000000-0000-0000-0000-000000000009/providers/Microsoft.Network/dnszones?api-version=2018-05-01", "")

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Equal(t, "SubscriptionNotFound", body["error"].(map[string]any)["code"])
	})
}

func TestAzureDNSFake_TXT(t *testing.T) {
	const name = "_acme-challenge." + dnsZoneName
	seed, err := json.Marshal(azure.WithDNSZone(dnsSubscription, "rg1", dnsZoneName))
	require.NoError(t, err)
	newZones := func(t *testing.T) (*fakenet.Server, *azure.DNSZones) {
		t.Helper()
		srv := fakenet.New()
		d := azure.DNS.New(srv.Emitter(azure.DNS.Host(), "c1")).(*azure.DNSZones)
		require.NoError(t, d.Seed(seed))
		return srv, d
	}
	serve := func(t *testing.T, d *azure.DNSZones, method, body string) {
		t.Helper()
		w := httptest.NewRecorder()
		d.ServeHTTP(w, httptest.NewRequest(method, dnsZoneID+"/TXT/_acme-challenge?api-version=2018-05-01", strings.NewReader(body)))
		require.Less(t, w.Code, 300, w.Body.String())
	}
	const put = `{"properties":{"TTL":60,"TXTRecords":[{"value":["token"]}]}}`

	t.Run("should serve a written TXT answer and withdraw it when the record set is deleted", func(t *testing.T) {
		// Setup
		srv, d := newZones(t)

		// Action
		serve(t, d, http.MethodPut, put)
		served := srv.Emitter("", "").LookupTXT(name)
		serve(t, d, http.MethodDelete, "")

		// Assert
		require.Equal(t, []string{"token"}, served)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw a written TXT answer when its zone is reseeded", func(t *testing.T) {
		// Setup
		srv, d := newZones(t)
		serve(t, d, http.MethodPut, put)

		// Action
		require.NoError(t, d.Seed(seed))
		withdrawn := srv.Emitter("", "").LookupTXT(name)
		d.Release()

		// Assert
		require.Empty(t, withdrawn)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})
}
