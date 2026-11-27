package oauth

import (
	"encoding/json"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/zonefile"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// GCPCloudDNS answers as Cloud DNS v1, dns.googleapis.com: the managed zones an
// impersonated service account can reach, their record sets, and changes to them. Like
// Certificate Manager it is scoped by the impersonated account's email.
var GCPCloudDNS = gcpService{host: "dns.googleapis.com", newFake: newGCPCloudDNS}

// CloudDNS is the managed zones one service account can reach, by full resource name
// (projects/<p>/managedZones/<zone>).
type CloudDNS struct {
	ManagedZones map[string]*GCPManagedZone `json:"managedZones"`

	mu       sync.Mutex
	mux      *http.ServeMux
	changes  int
	released bool
	events   fakenet.Emitter
}

// GCPManagedZone is a public zone serving dnsName ("example.com.") and its record sets
// by "<name>/<type>".
type GCPManagedZone struct {
	DNSName string                           `json:"dnsName"`
	RRSets  map[string]*GCPResourceRecordSet `json:"rrsets"`
}

// GCPResourceRecordSet is a record set as Cloud DNS stores and returns it.
type GCPResourceRecordSet struct {
	Kind    string   `json:"kind,omitempty"`
	Name    string   `json:"name"`
	Type    string   `json:"type"`
	TTL     int      `json:"ttl"`
	RRDatas []string `json:"rrdatas"`
}

// GCPDNSRecordDetail names a record set a change added or deleted, in its zone.
type GCPDNSRecordDetail struct {
	Zone string `json:"zone"`
	GCPResourceRecordSet
}

type GCPDNSRecordCreated struct{ GCPDNSRecordDetail }
type GCPDNSRecordDeleted struct{ GCPDNSRecordDetail }

func (GCPDNSRecordCreated) EventName() string { return "gcp.dns-record-created" }
func (GCPDNSRecordDeleted) EventName() string { return "gcp.dns-record-deleted" }

// SeedGCPManagedZone is a seed fragment creating an empty managed zone for dnsName,
// written with or without the trailing dot.
func SeedGCPManagedZone(project, zone, dnsName string) any {
	return map[string]any{"managedZones": map[string]any{
		"projects/" + project + "/managedZones/" + zone: map[string]any{"dnsName": zonefile.Absolute(dnsName)},
	}}
}

func newGCPCloudDNS(events fakenet.Emitter) fakenet.Fake {
	c := &CloudDNS{ManagedZones: map[string]*GCPManagedZone{}, events: events}
	c.mux = http.NewServeMux()
	c.mux.HandleFunc("GET /dns/v1/projects/{project}/managedZones/{zone}/rrsets/{name}/{type}", c.getRRSet)
	c.mux.HandleFunc("POST /dns/v1/projects/{project}/managedZones/{zone}/changes", c.createChange)
	c.mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		cloudDNSError(w, http.StatusNotFound, "notFound", "The requested URL was not found on this server.")
	})
	return c
}

func (c *CloudDNS) ServeHTTP(w http.ResponseWriter, r *http.Request) { c.mux.ServeHTTP(w, r) }

// zone finds a managed zone under the lock, or answers as Cloud DNS does for one that
// does not exist.
func (c *CloudDNS) zone(w http.ResponseWriter, r *http.Request) (string, *GCPManagedZone, bool) {
	name := "projects/" + r.PathValue("project") + "/managedZones/" + r.PathValue("zone")
	z, ok := c.ManagedZones[name]
	if !ok {
		cloudDNSError(w, http.StatusNotFound, "notFound", "The 'parameters.managedZone' resource named '"+r.PathValue("zone")+"' does not exist.")
	}
	return name, z, ok
}

func (c *CloudDNS) getRRSet(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	_, z, ok := c.zone(w, r)
	if !ok {
		c.mu.Unlock()
		return
	}
	rs, found := z.RRSets[r.PathValue("name")+"/"+r.PathValue("type")]
	var out GCPResourceRecordSet
	if found {
		out = *rs
	}
	c.mu.Unlock()
	if !found {
		cloudDNSError(w, http.StatusNotFound, "notFound", "The 'parameters.name' resource named '"+r.PathValue("name")+"' does not exist.")
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type gcpChange struct {
	Additions []GCPResourceRecordSet `json:"additions"`
	Deletions []GCPResourceRecordSet `json:"deletions"`
}

// createChange applies a change atomically, the way Cloud DNS does.
func (c *CloudDNS) createChange(w http.ResponseWriter, r *http.Request) {
	var in gcpChange
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		cloudDNSError(w, http.StatusBadRequest, "parseError", "Parse Error")
		return
	}
	if len(in.Additions) == 0 && len(in.Deletions) == 0 {
		cloudDNSError(w, http.StatusBadRequest, "required", "The 'entity.change' parameter is required but was missing.")
		return
	}

	c.mu.Lock()
	zoneName, z, ok := c.zone(w, r)
	if !ok {
		c.mu.Unlock()
		return
	}
	next, rejected := planChange(z, in)
	if rejected != nil {
		c.mu.Unlock()
		cloudDNSError(w, rejected.status, rejected.reason, rejected.message)
		return
	}
	// added maps each TXT name the change touches to whether it adds to it.
	added := map[string]bool{}
	for _, rs := range in.Deletions {
		if rs.Type == "TXT" {
			added[rs.Name] = false
		}
	}
	for _, rs := range in.Additions {
		if rs.Type == "TXT" {
			added[rs.Name] = true
		}
	}
	before := z.RRSets
	z.RRSets = next
	c.changes++
	changeID := strconv.Itoa(c.changes)
	for name, isAdded := range added {
		switch {
		case c.released:
		case isAdded:
			c.events.SetTXT(name, txtOf(next, name)...)
		default:
			c.events.ReplaceTXT(name, txtOf(before, name), txtOf(next, name)...)
		}
	}
	c.mu.Unlock()

	for _, rs := range in.Deletions {
		c.events.Publish(GCPDNSRecordDeleted{GCPDNSRecordDetail{Zone: zoneName, GCPResourceRecordSet: rs}})
	}
	for _, rs := range in.Additions {
		c.events.Publish(GCPDNSRecordCreated{GCPDNSRecordDetail{Zone: zoneName, GCPResourceRecordSet: rs}})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"kind":      "dns#change",
		"id":        changeID,
		"status":    "done",
		"startTime": time.Now().UTC().Format(time.RFC3339Nano),
		"additions": in.Additions,
		"deletions": in.Deletions,
	})
}

// changeRejection is the error Cloud DNS answers a change with.
type changeRejection struct {
	status          int
	reason, message string
}

// planChange returns the zone's record sets after the change, or why Cloud DNS refuses
// it: every deletion must match the record set as it stands, and every addition must
// not exist once the deletions are applied.
func planChange(z *GCPManagedZone, in gcpChange) (map[string]*GCPResourceRecordSet, *changeRejection) {
	check := func(field string, rs GCPResourceRecordSet) *changeRejection {
		if !strings.HasSuffix(rs.Name, ".") || (rs.Name != z.DNSName && !strings.HasSuffix(rs.Name, "."+z.DNSName)) {
			return &changeRejection{http.StatusBadRequest, "invalid", "Invalid value for '" + field + ".name': '" + rs.Name + "'"}
		}
		if rs.Type == "" || len(rs.RRDatas) == 0 {
			return &changeRejection{http.StatusBadRequest, "required", "The '" + field + ".rrdata' parameter is required but was missing."}
		}
		return nil
	}
	for i, rs := range in.Deletions {
		if rejected := check("entity.change.deletions["+strconv.Itoa(i)+"]", rs); rejected != nil {
			return nil, rejected
		}
	}
	for i, rs := range in.Additions {
		if rejected := check("entity.change.additions["+strconv.Itoa(i)+"]", rs); rejected != nil {
			return nil, rejected
		}
	}

	next := maps.Clone(z.RRSets)
	for i, del := range in.Deletions {
		key := del.Name + "/" + del.Type
		have, exists := next[key]
		if !exists {
			return nil, &changeRejection{http.StatusNotFound, "notFound", "The 'entity.change.deletions[" + strconv.Itoa(i) + "]' resource named '" + del.Name + " (" + del.Type + ")' does not exist."}
		}
		if have.TTL != del.TTL || !slices.Equal(have.RRDatas, del.RRDatas) {
			return nil, &changeRejection{http.StatusPreconditionFailed, "conditionNotMet", "Precondition not met for 'entity.change.deletions[" + strconv.Itoa(i) + "]'"}
		}
		delete(next, key)
	}
	for i, add := range in.Additions {
		key := add.Name + "/" + add.Type
		if _, exists := next[key]; exists {
			return nil, &changeRejection{http.StatusConflict, "alreadyExists", "The resource 'entity.change.additions[" + strconv.Itoa(i) + "]' named '" + add.Name + " (" + add.Type + ")' already exists"}
		}
		stored := add
		stored.Kind = "dns#resourceRecordSet"
		next[key] = &stored
	}
	return next, nil
}

// txtOf is what DNS serves for the TXT record set named name.
func txtOf(rrsets map[string]*GCPResourceRecordSet, name string) []string {
	if rs, ok := rrsets[name+"/TXT"]; ok {
		return txtValues(rs.RRDatas)
	}
	return nil
}

// Release withdraws the service account's TXT answers when the test removes its scope,
// leaving a name another publisher has written since. released stops a request fakenet
// handed the scope before the removal from publishing them again.
func (c *CloudDNS) Release() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.released = true
	for _, z := range c.ManagedZones {
		for _, rs := range z.RRSets {
			if rs.Type == "TXT" {
				c.events.ReplaceTXT(rs.Name, txtValues(rs.RRDatas))
			}
		}
	}
}

// txtValues is what DNS serves for TXT rrdatas in zone file form: the quoted strings of
// each joined, or the bare text when it is not quoted.
func txtValues(rrdatas []string) []string {
	out := make([]string, 0, len(rrdatas))
	for _, d := range rrdatas {
		if !strings.HasPrefix(d, `"`) {
			out = append(out, d)
			continue
		}
		out = append(out, zonefile.Unquote(d))
	}
	return out
}

// cloudDNSError answers with the error body of Google's discovery APIs, which Cloud DNS
// v1 is.
func cloudDNSError(w http.ResponseWriter, status int, reason, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(CloudDNSError(status, reason, message)))
}

// CloudDNSError is a Cloud DNS error body, for a test that injects one with Fail.
func CloudDNSError(status int, reason, message string) string {
	raw, _ := json.Marshal(map[string]any{"error": map[string]any{
		"code":    status,
		"message": message,
		"errors":  []map[string]string{{"message": message, "domain": "global", "reason": reason}},
	}})
	return string(raw)
}

func (c *CloudDNS) Snapshot() ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return json.Marshal(struct {
		ManagedZones map[string]*GCPManagedZone `json:"managedZones"`
	}{c.ManagedZones})
}

func (c *CloudDNS) Seed(raw []byte) error {
	var in struct {
		ManagedZones map[string]*GCPManagedZone `json:"managedZones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for name, z := range in.ManagedZones {
		if z.RRSets == nil {
			z.RRSets = map[string]*GCPResourceRecordSet{}
		}
		if old, ok := c.ManagedZones[name]; ok && !c.released {
			for _, rs := range old.RRSets {
				if rs.Type == "TXT" {
					c.events.ReplaceTXT(rs.Name, txtValues(rs.RRDatas), txtOf(z.RRSets, rs.Name)...)
				}
			}
		}
		c.ManagedZones[name] = z
	}
	return nil
}
