package oauth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

const managedZone = "/dns/v1/projects/p1/managedZones/zone1"

func newCloudDNS(t *testing.T) (call func(method, path, body string) (int, map[string]any), cp *GCPControlPlane) {
	t.Helper()
	fakes, cp := newGCP(t)
	cp.CloudDNS.Seed(t, SeedGCPManagedZone("p1", "zone1", "example.test"))
	token := impersonate(t, fakes)
	return func(method, path, body string) (int, map[string]any) {
		return gcpCall(t, fakes, GCPCloudDNS.Host(), method, path, token, strings.NewReader(body), "application/json")
	}, cp
}

func TestGCPFake_CloudDNS(t *testing.T) {
	t.Run("should add a TXT record set with a change, serve it, and delete it with another", func(t *testing.T) {
		// Setup
		call, cp := newCloudDNS(t)
		rrset := `{"name":"_acme-challenge.www.example.test.","type":"TXT","ttl":60,"rrdatas":["\"token\""]}`

		// Action
		added, change := call(http.MethodPost, managedZone+"/changes", `{"additions":[`+rrset+`]}`)
		read, got := call(http.MethodGet, managedZone+"/rrsets/_acme-challenge.www.example.test./TXT", "")
		deleted, _ := call(http.MethodPost, managedZone+"/changes", `{"deletions":[`+rrset+`]}`)
		gone, _ := call(http.MethodGet, managedZone+"/rrsets/_acme-challenge.www.example.test./TXT", "")

		// Assert
		require.Equal(t, http.StatusOK, added)
		require.Equal(t, "dns#change", change["kind"])
		require.Equal(t, "done", change["status"])
		require.Equal(t, http.StatusOK, read)
		require.Equal(t, "dns#resourceRecordSet", got["kind"])
		require.Equal(t, []any{`"token"`}, got["rrdatas"])
		require.Equal(t, http.StatusOK, deleted)
		require.Equal(t, http.StatusNotFound, gone)
		cp.CloudDNS.ExpectEvent[GCPDNSRecordCreated](t, func(e GCPDNSRecordCreated) bool { return e.Name == "_acme-challenge.www.example.test." })
		cp.CloudDNS.ExpectEvent[GCPDNSRecordDeleted](t, func(e GCPDNSRecordDeleted) bool { return e.Name == "_acme-challenge.www.example.test." })
	})

	t.Run("should refuse to add a record set that already exists", func(t *testing.T) {
		// Setup
		call, cp := newCloudDNS(t)
		rrset := `{"name":"a.example.test.","type":"TXT","ttl":60,"rrdatas":["\"x\""]}`
		call(http.MethodPost, managedZone+"/changes", `{"additions":[`+rrset+`]}`)

		// Action
		code, out := call(http.MethodPost, managedZone+"/changes", `{"additions":[`+rrset+`]}`)

		// Assert
		require.Equal(t, http.StatusConflict, code)
		require.Equal(t, "alreadyExists", out["error"].(map[string]any)["errors"].([]any)[0].(map[string]any)["reason"])
		require.Len(t, cp.CloudDNS.State(t).ManagedZones["projects/p1/managedZones/zone1"].RRSets, 1)
	})

	t.Run("should refuse a deletion that does not match the record set as it stands", func(t *testing.T) {
		// Setup
		call, cp := newCloudDNS(t)
		call(http.MethodPost, managedZone+"/changes", `{"additions":[{"name":"a.example.test.","type":"TXT","ttl":60,"rrdatas":["\"x\""]}]}`)

		// Action
		code, _ := call(http.MethodPost, managedZone+"/changes", `{"deletions":[{"name":"a.example.test.","type":"TXT","ttl":60,"rrdatas":["\"y\""]}]}`)

		// Assert
		require.Equal(t, http.StatusPreconditionFailed, code)
		require.Equal(t, []string{`"x"`}, cp.CloudDNS.State(t).ManagedZones["projects/p1/managedZones/zone1"].RRSets["a.example.test./TXT"].RRDatas)
	})

	t.Run("should refuse a record set outside the zone", func(t *testing.T) {
		// Setup
		call, cp := newCloudDNS(t)

		// Action
		code, _ := call(http.MethodPost, managedZone+"/changes", `{"additions":[{"name":"a.other.test.","type":"TXT","ttl":60,"rrdatas":["\"x\""]}]}`)

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Empty(t, cp.CloudDNS.State(t).ManagedZones["projects/p1/managedZones/zone1"].RRSets)
	})

	t.Run("should answer 404 for a managed zone that does not exist", func(t *testing.T) {
		// Setup
		call, _ := newCloudDNS(t)

		// Action
		code, out := call(http.MethodGet, "/dns/v1/projects/p1/managedZones/nope/rrsets/a.example.test./TXT", "")

		// Assert
		require.Equal(t, http.StatusNotFound, code)
		require.Equal(t, "The 'parameters.managedZone' resource named 'nope' does not exist.", out["error"].(map[string]any)["message"])
	})
}

func TestGCPFake_CloudDNSTXT(t *testing.T) {
	const name = "_acme-challenge.www.example.test"
	seed, err := json.Marshal(SeedGCPManagedZone("p1", "zone1", "example.test"))
	require.NoError(t, err)
	newZones := func(t *testing.T) (*fakenet.Server, *CloudDNS) {
		t.Helper()
		srv := fakenet.New()
		c := newGCPCloudDNS(srv.Emitter(GCPCloudDNS.Host(), "a")).(*CloudDNS)
		require.NoError(t, c.Seed(seed))
		return srv, c
	}
	change := func(t *testing.T, c *CloudDNS, body string) {
		t.Helper()
		w := httptest.NewRecorder()
		c.ServeHTTP(w, httptest.NewRequest(http.MethodPost, managedZone+"/changes", strings.NewReader(body)))
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	}
	const rrset = `{"name":"` + name + `.","type":"TXT","ttl":60,"rrdatas":["\"token\""]}`

	t.Run("should serve an added TXT answer and withdraw it with a deletion-only change", func(t *testing.T) {
		// Setup
		srv, c := newZones(t)

		// Action
		change(t, c, `{"additions":[`+rrset+`]}`)
		served := srv.Emitter("", "").LookupTXT(name)
		change(t, c, `{"deletions":[`+rrset+`]}`)

		// Assert
		require.Equal(t, []string{"token"}, served)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw an added TXT answer when its zone is reseeded", func(t *testing.T) {
		// Setup
		srv, c := newZones(t)
		change(t, c, `{"additions":[`+rrset+`]}`)

		// Action
		require.NoError(t, c.Seed(seed))
		withdrawn := srv.Emitter("", "").LookupTXT(name)
		c.Release()

		// Assert
		require.Empty(t, withdrawn)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})
}
