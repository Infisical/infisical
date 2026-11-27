package powerdns

import (
	"encoding/json"
	"net/http"
	"slices"
	"sort"
	"strings"

	"github.com/Infisical/infisical/tests/fakes/internal/zonefile"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers on a fixed .test name over HTTPS on port 443. A PowerDNS server is
// self-hosted, so it has no vendor hostname; tests pass this one as the connection's
// API URL.
var Service = service{}

func (service) Host() string { return "api.powerdns.test" }

// Scope is the X-API-Key header.
func (service) Scope(r *http.Request) (string, bool) {
	key := r.Header.Get("X-API-Key")
	return key, key != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	s := &Server{Zones: map[string]*Zone{}, events: events}
	s.mux = http.NewServeMux()
	s.mux.HandleFunc("GET /api/v1/servers/{server}/zones", s.listZones)
	s.mux.HandleFunc("GET /api/v1/servers/{server}/zones/{zone}", s.getZone)
	s.mux.HandleFunc("PATCH /api/v1/servers/{server}/zones/{zone}", s.patchZone)
	s.mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) { fail(w, http.StatusNotFound, "Not Found") })
	return s
}

// serverID is the only server the Authoritative Server reports.
const serverID = "localhost"

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	accepted := s.KeyAccepted
	s.mu.Unlock()
	if !accepted {
		fail(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	s.mux.ServeHTTP(w, r)
}

func (s *Server) knownServer(w http.ResponseWriter, r *http.Request) bool {
	if r.PathValue("server") != serverID {
		fail(w, http.StatusNotFound, "Not Found")
		return false
	}
	return true
}

func zoneSummary(id string, z *Zone) map[string]any {
	return map[string]any{
		"id":     id,
		"name":   z.Name,
		"type":   "Zone",
		"url":    "/api/v1/servers/" + serverID + "/zones/" + id,
		"kind":   "Native",
		"serial": z.Serial,
	}
}

func (s *Server) listZones(w http.ResponseWriter, r *http.Request) {
	if !s.knownServer(w, r) {
		return
	}
	s.mu.Lock()
	ids := make([]string, 0, len(s.Zones))
	for id := range s.Zones {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, zoneSummary(id, s.Zones[id]))
	}
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) getZone(w http.ResponseWriter, r *http.Request) {
	if !s.knownServer(w, r) {
		return
	}
	q := r.URL.Query()
	name, typ := q.Get("rrset_name"), q.Get("rrset_type")
	if typ != "" && name == "" {
		fail(w, http.StatusUnprocessableEntity, "rrset_type given without rrset_name")
		return
	}

	id := r.PathValue("zone")
	s.mu.Lock()
	z, ok := s.Zones[id]
	if !ok {
		s.mu.Unlock()
		fail(w, http.StatusNotFound, "Could not find domain '"+id+"'")
		return
	}
	out := zoneSummary(id, z)
	rrsets := []RRSet{}
	for _, rs := range z.RRSets {
		if (name == "" || rs.Name == name) && (typ == "" || rs.Type == typ) {
			rrsets = append(rrsets, rs)
		}
	}
	out["rrsets"] = rrsets
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

type rrsetChange struct {
	Name       string    `json:"name"`
	Type       string    `json:"type"`
	TTL        *int      `json:"ttl"`
	ChangeType string    `json:"changetype"`
	Records    *[]Record `json:"records"`
}

// patchZone applies every RRset change or none, answering 422 with the message the
// Authoritative Server gives for the first one it refuses.
func (s *Server) patchZone(w http.ResponseWriter, r *http.Request) {
	if !s.knownServer(w, r) {
		return
	}
	var in struct {
		RRSets []rrsetChange `json:"rrsets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, "Could not parse JSON: "+err.Error())
		return
	}
	if len(in.RRSets) == 0 {
		fail(w, http.StatusUnprocessableEntity, "No rrsets given in update request")
		return
	}

	id := r.PathValue("zone")
	s.mu.Lock()
	z, ok := s.Zones[id]
	if !ok {
		s.mu.Unlock()
		fail(w, http.StatusNotFound, "Could not find domain '"+id+"'")
		return
	}
	next := slices.Clone(z.RRSets)
	type rrsetKey struct{ name, typ string }
	var touched []rrsetKey
	for _, ch := range in.RRSets {
		if msg := validate(ch, z.Name); msg != "" {
			s.mu.Unlock()
			fail(w, http.StatusUnprocessableEntity, msg)
			return
		}
		next = slices.DeleteFunc(next, func(rs RRSet) bool { return rs.Name == ch.Name && rs.Type == ch.Type })
		if ch.ChangeType == "REPLACE" && len(*ch.Records) > 0 {
			next = append(next, RRSet{Name: ch.Name, Type: ch.Type, TTL: *ch.TTL, Records: *ch.Records, Comments: []any{}})
		}
		if k := (rrsetKey{ch.Name, ch.Type}); !slices.Contains(touched, k) {
			touched = append(touched, k)
		}
	}
	var created, deleted []RecordDetail
	for _, k := range touched {
		before, after := recordsOf(z.RRSets, k.name, k.typ), recordsOf(next, k.name, k.typ)
		for _, rec := range after {
			if !slices.ContainsFunc(before, sameContent(rec)) {
				created = append(created, RecordDetail{Zone: id, Name: k.name, Type: k.typ, Content: rec.Content})
			}
		}
		for _, rec := range before {
			if !slices.ContainsFunc(after, sameContent(rec)) {
				deleted = append(deleted, RecordDetail{Zone: id, Name: k.name, Type: k.typ, Content: rec.Content})
			}
		}
		if k.typ != "TXT" || s.released {
			continue
		}
		if answers := txtAnswers(next, k.name); len(answers) > 0 {
			s.events.SetTXT(k.name, answers...)
		} else {
			s.events.ReplaceTXT(k.name, txtAnswers(z.RRSets, k.name))
		}
	}
	z.RRSets = next
	z.Serial++
	s.mu.Unlock()

	for _, d := range deleted {
		s.events.Publish(RecordDeleted{d})
	}
	for _, d := range created {
		s.events.Publish(RecordCreated{d})
	}
	w.WriteHeader(http.StatusNoContent)
}

// Release withdraws the server's TXT answers when the test removes its scope, leaving a
// name another publisher has written since. released stops a request fakenet handed the
// scope before the removal from publishing them again.
func (s *Server) Release() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.released = true
	for _, z := range s.Zones {
		for _, rs := range z.RRSets {
			if rs.Type == "TXT" {
				s.events.ReplaceTXT(rs.Name, txtAnswers(z.RRSets, rs.Name))
			}
		}
	}
}

func recordsOf(rrsets []RRSet, name, typ string) []Record {
	if i := slices.IndexFunc(rrsets, func(rs RRSet) bool { return rs.Name == name && rs.Type == typ }); i >= 0 {
		return rrsets[i].Records
	}
	return nil
}

func sameContent(rec Record) func(Record) bool {
	return func(other Record) bool { return other.Content == rec.Content }
}

// validate returns the Authoritative Server's message for a change it refuses.
func validate(ch rrsetChange, zone string) string {
	if !strings.HasSuffix(ch.Name, ".") {
		return "DNS Name '" + ch.Name + "' is not canonical"
	}
	if ch.Name != zone && !strings.HasSuffix(ch.Name, "."+zone) {
		return "RRset " + ch.Name + " IN " + ch.Type + ": Name is out of zone"
	}
	switch ch.ChangeType {
	case "DELETE":
		return ""
	case "REPLACE":
	case "":
		return "Key 'changetype' not present or not a String"
	default:
		return "Changetype not understood"
	}
	if ch.TTL == nil {
		return "Key 'ttl' not present or not an Integer"
	}
	if ch.Records == nil {
		return "Key 'records' not present or not an Array"
	}
	seen := map[string]bool{}
	for _, rec := range *ch.Records {
		if ch.Type == "TXT" && !strings.HasPrefix(rec.Content, `"`) {
			return "Record " + ch.Name + "/TXT '" + rec.Content + "': Parsing record content (try 'pdnsutil check-zone'): Data field in DNS should start with quote (\") at position 0 of '" + rec.Content + "'"
		}
		if seen[rec.Content] {
			return "RRset " + ch.Name + " IN " + ch.Type + " has duplicate record with content \"" + rec.Content + "\""
		}
		seen[rec.Content] = true
	}
	return ""
}

// txtAnswers is what DNS serves for the TXT RRset named name: its enabled records.
func txtAnswers(rrsets []RRSet, name string) []string {
	var out []string
	for _, rs := range rrsets {
		if rs.Name == name && rs.Type == "TXT" {
			for _, rec := range rs.Records {
				if !rec.Disabled {
					out = append(out, zonefile.Unquote(rec.Content))
				}
			}
		}
	}
	return out
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
