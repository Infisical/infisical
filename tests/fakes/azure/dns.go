package azure

import (
	"encoding/json"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
)

// DNS answers as Azure Resource Manager, management.azure.com, for the DNS zones
// (Microsoft.Network/dnsZones) and TXT record sets in them. Like Key Vault it is scoped
// by the access token the tenant's token endpoint minted ("azure-<client id>"), so a
// test opens it with the connection's client id.
var DNS = dnsService{}

type dnsService struct{}

func (dnsService) Host() string { return "management.azure.com" }

func (dnsService) Scope(r *http.Request) (string, bool) { return clientOf(r) }

func (dnsService) New(events fakenet.Emitter) fakenet.Fake {
	return &DNSZones{Subscriptions: []string{}, Zones: map[string]*DNSZone{}, events: events}
}

// dnsAPIVersions are the api-versions Microsoft.Network serves dnsZones under.
var dnsAPIVersions = []string{"2016-04-01", "2017-09-01", "2017-10-01", "2018-03-01-preview", "2018-05-01", "2023-07-01-preview"}

// dnsZoneListPage is the most zones one list page holds, Resource Manager's default.
const dnsZoneListPage = 100

// DNSZones is every DNS zone one client can reach, by resource id.
type DNSZones struct {
	// Subscriptions are the subscriptions the client may list zones in.
	Subscriptions []string `json:"subscriptions"`

	// Zones maps a zone's resource id, lowercased because Resource Manager ids are
	// case-insensitive, to the zone.
	Zones map[string]*DNSZone `json:"zones"`

	mu       sync.Mutex
	released bool
	events   fakenet.Emitter
}

// DNSZone is one public zone and its TXT record sets by relative name ("@" is the apex).
type DNSZone struct {
	ID   string                        `json:"id"`
	Name string                        `json:"name"`
	TXT  map[string]*AzureTXTRecordSet `json:"txt"`
}

// AzureTXTRecordSet is one TXT record set. Each record is a list of strings that DNS
// serves joined.
type AzureTXTRecordSet struct {
	TTL     int        `json:"ttl"`
	Etag    string     `json:"etag"`
	Records [][]string `json:"records"`
}

// DNSRecordDetail names a TXT record set by zone and relative name, with its values
// after the change.
type DNSRecordDetail struct {
	Zone   string   `json:"zone"`
	Name   string   `json:"name"`
	Values []string `json:"values,omitempty"`
}

type DNSRecordCreated struct{ DNSRecordDetail }
type DNSRecordUpdated struct{ DNSRecordDetail }
type DNSRecordDeleted struct{ DNSRecordDetail }

func (DNSRecordCreated) EventName() string { return "azure.dns-record-created" }
func (DNSRecordUpdated) EventName() string { return "azure.dns-record-updated" }
func (DNSRecordDeleted) EventName() string { return "azure.dns-record-deleted" }

// DNSZoneID is the resource id of a zone.
func DNSZoneID(subscription, resourceGroup, zone string) string {
	return "/subscriptions/" + subscription + "/resourceGroups/" + resourceGroup + "/providers/Microsoft.Network/dnsZones/" + zone
}

// WithSubscription is a seed fragment letting the client list zones in a subscription.
func WithSubscription(subscription string) any {
	return map[string]any{"subscriptions": []string{subscription}}
}

// WithDNSZone is a seed fragment creating an empty zone, and access to its subscription.
func WithDNSZone(subscription, resourceGroup, zone string) any {
	zoneID := DNSZoneID(subscription, resourceGroup, zone)
	return map[string]any{
		"subscriptions": []string{subscription},
		"zones":         map[string]any{strings.ToLower(zoneID): map[string]any{"id": zoneID, "name": zone}},
	}
}

func (d *DNSZones) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	version := r.URL.Query().Get("api-version")
	if version == "" {
		armError(w, http.StatusBadRequest, "MissingApiVersionParameter", "The api-version query parameter (?api-version=) is required for all requests.")
		return
	}
	if !slices.Contains(dnsAPIVersions, version) {
		armError(w, http.StatusBadRequest, "InvalidApiVersionParameter", "The api-version '"+version+"' is invalid. The supported versions are '"+strings.Join(dnsAPIVersions, ",")+"'.")
		return
	}

	// Resource Manager paths are case-insensitive, so they are matched by segment
	// rather than with ServeMux patterns.
	seg := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	is := func(i int, want string) bool { return i < len(seg) && strings.EqualFold(seg[i], want) }
	switch {
	case len(seg) == 5 && is(0, "subscriptions") && is(2, "providers") && is(3, "Microsoft.Network") && is(4, "dnszones") && r.Method == http.MethodGet:
		d.listZones(w, r, seg[1])
	case len(seg) == 10 && is(0, "subscriptions") && is(2, "resourceGroups") && is(4, "providers") && is(5, "Microsoft.Network") && is(6, "dnszones") && is(8, "TXT"):
		zoneID := "/" + strings.Join(seg[:8], "/")
		switch r.Method {
		case http.MethodGet:
			d.getRecordSet(w, zoneID, seg[9])
		case http.MethodPut:
			d.putRecordSet(w, r, zoneID, seg[9])
		case http.MethodDelete:
			d.deleteRecordSet(w, zoneID, seg[9])
		default:
			armError(w, http.StatusMethodNotAllowed, "MethodNotAllowed", "The requested resource does not support http method '"+r.Method+"'.")
		}
	default:
		armError(w, http.StatusNotFound, "NotFound", "The requested resource was not found.")
	}
}

func (d *DNSZones) listZones(w http.ResponseWriter, r *http.Request, subscription string) {
	start := 0
	if raw := r.URL.Query().Get("$skipToken"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			armError(w, http.StatusBadRequest, "InvalidSkipToken", "The skip token '"+raw+"' is invalid.")
			return
		}
		start = n
	}

	d.mu.Lock()
	if !slices.ContainsFunc(d.Subscriptions, func(s string) bool { return strings.EqualFold(s, subscription) }) {
		d.mu.Unlock()
		armError(w, http.StatusNotFound, "SubscriptionNotFound", "The subscription '"+subscription+"' could not be found.")
		return
	}
	prefix := strings.ToLower("/subscriptions/" + subscription + "/")
	var ids []string
	for key := range d.Zones {
		if strings.HasPrefix(key, prefix) {
			ids = append(ids, key)
		}
	}
	slices.Sort(ids)
	start = min(start, len(ids))
	end := min(start+dnsZoneListPage, len(ids))
	value := make([]map[string]any, 0, end-start)
	for _, key := range ids[start:end] {
		z := d.Zones[key]
		value = append(value, map[string]any{
			"id":       z.ID,
			"name":     z.Name,
			"type":     "Microsoft.Network/dnszones",
			"location": "global",
			"tags":     map[string]string{},
			"properties": map[string]any{
				"maxNumberOfRecordSets": 10000,
				"numberOfRecordSets":    2 + len(z.TXT),
				"nameServers":           []string{"ns1-01.azure-dns.com.", "ns2-01.azure-dns.net."},
				"zoneType":              "Public",
			},
		})
	}
	d.mu.Unlock()

	out := map[string]any{"value": value}
	if end < len(ids) {
		out["nextLink"] = "https://" + DNS.Host() + r.URL.Path + "?" + url.Values{
			"api-version": {r.URL.Query().Get("api-version")},
			"$skipToken":  {strconv.Itoa(end)},
		}.Encode()
	}
	writeJSON(w, http.StatusOK, out)
}

// zone finds a zone under the lock, or answers as Resource Manager does for a record
// set whose parent zone does not exist.
func (d *DNSZones) zone(w http.ResponseWriter, zoneID string) (*DNSZone, bool) {
	z, ok := d.Zones[strings.ToLower(zoneID)]
	if !ok {
		name := zoneID[strings.LastIndex(zoneID, "/")+1:]
		armError(w, http.StatusNotFound, "ParentResourceNotFound", "Can not perform requested operation on nested resource. Parent resource '"+name+"' not found.")
	}
	return z, ok
}

func (d *DNSZones) getRecordSet(w http.ResponseWriter, zoneID, name string) {
	d.mu.Lock()
	z, ok := d.zone(w, zoneID)
	if !ok {
		d.mu.Unlock()
		return
	}
	rs, found := z.TXT[strings.ToLower(name)]
	var body map[string]any
	if found {
		body = recordSetBody(z, name, rs)
	}
	d.mu.Unlock()
	if !found {
		armError(w, http.StatusNotFound, "NotFound", "The resource record '"+name+"' does not exist in resource group '"+resourceGroupOf(zoneID)+"' of subscription '"+subscriptionOf(zoneID)+"'.")
		return
	}
	writeJSON(w, http.StatusOK, body)
}

type recordSetRequest struct {
	Properties *struct {
		TTL        *int `json:"TTL"`
		TXTRecords []struct {
			Value []string `json:"value"`
		} `json:"TXTRecords"`
	} `json:"properties"`
}

func (d *DNSZones) putRecordSet(w http.ResponseWriter, r *http.Request, zoneID, name string) {
	var in recordSetRequest
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Properties == nil {
		armError(w, http.StatusBadRequest, "InvalidRequestContent", "The request content was invalid and could not be deserialized: 'properties' is required.")
		return
	}
	records := make([][]string, 0, len(in.Properties.TXTRecords))
	for _, rec := range in.Properties.TXTRecords {
		for _, s := range rec.Value {
			if len(s) > 1024 {
				armError(w, http.StatusBadRequest, "BadRequest", "The length of each string in a TXT record cannot exceed 1024 characters.")
				return
			}
		}
		records = append(records, rec.Value)
	}
	ttl := 3600
	if in.Properties.TTL != nil {
		ttl = *in.Properties.TTL
	}

	d.mu.Lock()
	z, ok := d.zone(w, zoneID)
	if !ok {
		d.mu.Unlock()
		return
	}
	_, existed := z.TXT[strings.ToLower(name)]
	rs := &AzureTXTRecordSet{TTL: ttl, Etag: uuid.NewString(), Records: records}
	z.TXT[strings.ToLower(name)] = rs
	body := recordSetBody(z, name, rs)
	zoneName := z.Name
	values := joined(records)
	if !d.released {
		d.events.SetTXT(fqdn(name, zoneName), values...)
	}
	d.mu.Unlock()

	detail := DNSRecordDetail{Zone: zoneName, Name: name, Values: values}
	if existed {
		d.events.Publish(DNSRecordUpdated{detail})
		writeJSON(w, http.StatusOK, body)
		return
	}
	d.events.Publish(DNSRecordCreated{detail})
	writeJSON(w, http.StatusCreated, body)
}

func (d *DNSZones) deleteRecordSet(w http.ResponseWriter, zoneID, name string) {
	d.mu.Lock()
	z, ok := d.zone(w, zoneID)
	if !ok {
		d.mu.Unlock()
		return
	}
	rs, found := z.TXT[strings.ToLower(name)]
	delete(z.TXT, strings.ToLower(name))
	zoneName := z.Name
	if found && !d.released {
		d.events.ReplaceTXT(fqdn(name, zoneName), joined(rs.Records))
	}
	d.mu.Unlock()

	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	d.events.Publish(DNSRecordDeleted{DNSRecordDetail{Zone: zoneName, Name: name, Values: joined(rs.Records)}})
	w.WriteHeader(http.StatusOK)
}

// Release withdraws the client's TXT answers when the test removes its scope, leaving a
// name another publisher has written since. released stops a request fakenet handed the
// scope before the removal from publishing them again.
func (d *DNSZones) Release() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.released = true
	for _, z := range d.Zones {
		for name, rs := range z.TXT {
			d.events.ReplaceTXT(fqdn(name, z.Name), joined(rs.Records))
		}
	}
}

func recordSetBody(z *DNSZone, name string, rs *AzureTXTRecordSet) map[string]any {
	records := make([]map[string]any, 0, len(rs.Records))
	for _, rec := range rs.Records {
		records = append(records, map[string]any{"value": rec})
	}
	return map[string]any{
		"id":   z.ID + "/TXT/" + name,
		"name": name,
		"type": "Microsoft.Network/dnszones/TXT",
		"etag": rs.Etag,
		"properties": map[string]any{
			"metadata":          map[string]string{},
			"TTL":               rs.TTL,
			"fqdn":              fqdn(name, z.Name) + ".",
			"provisioningState": "Succeeded",
			"targetResource":    map[string]any{},
			"TXTRecords":        records,
		},
	}
}

// fqdn is the name a relative record set name serves on; "@" is the zone apex.
func fqdn(name, zone string) string {
	if name == "@" {
		return zone
	}
	return name + "." + zone
}

// joined is what DNS serves for each TXT record: its strings concatenated.
func joined(records [][]string) []string {
	out := make([]string, 0, len(records))
	for _, rec := range records {
		out = append(out, strings.Join(rec, ""))
	}
	return out
}

func subscriptionOf(zoneID string) string { return strings.Split(zoneID, "/")[2] }

func resourceGroupOf(zoneID string) string { return strings.Split(zoneID, "/")[4] }

func armError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}

func (d *DNSZones) Snapshot() ([]byte, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	return json.Marshal(struct {
		Subscriptions []string            `json:"subscriptions"`
		Zones         map[string]*DNSZone `json:"zones"`
	}{d.Subscriptions, d.Zones})
}

func (d *DNSZones) Seed(raw []byte) error {
	var in struct {
		Subscriptions []string            `json:"subscriptions"`
		Zones         map[string]*DNSZone `json:"zones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, s := range in.Subscriptions {
		if !slices.Contains(d.Subscriptions, s) {
			d.Subscriptions = append(d.Subscriptions, s)
		}
	}
	for key, z := range in.Zones {
		if z.TXT == nil {
			z.TXT = map[string]*AzureTXTRecordSet{}
		}
		if old, ok := d.Zones[strings.ToLower(key)]; ok && !d.released {
			for name, rs := range old.TXT {
				var kept []string
				if next, ok := z.TXT[name]; ok {
					kept = joined(next.Records)
				}
				d.events.ReplaceTXT(fqdn(name, old.Name), joined(rs.Records), kept...)
			}
		}
		d.Zones[strings.ToLower(key)] = z
	}
	return nil
}

// DNSControlPlane is a test's view of the zones one client reaches.
type DNSControlPlane struct {
	*fakenet.Scope[DNSZones]
}

// OpenDNS returns the zones a client id's tokens reach.
func OpenDNS(tt *testing.T, adminURL, clientID string) *DNSControlPlane {
	tt.Helper()
	fakenet.Track(tt, adminURL, DNS.Host(), clientID)
	return &DNSControlPlane{fakenet.Open[DNSZones](tt, adminURL, DNS.Host(), clientID)}
}
