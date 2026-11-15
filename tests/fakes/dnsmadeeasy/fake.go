package dnsmadeeasy

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers as api.dnsmadeeasy.com, the host Infisical hardcodes.
var Service = service{}

func (service) Host() string { return "api.dnsmadeeasy.com" }

// Scope is the API key.
func (service) Scope(r *http.Request) (string, bool) {
	key := r.Header.Get("x-dnsme-apiKey")
	return key, key != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{Zones: map[string]*Zone{}, events: events}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("GET /V2.0/dns/managed/", a.listZones)
	a.mux.HandleFunc("POST /V2.0/dns/managed/{zone}/records", a.createRecord)
	a.mux.HandleFunc("GET /V2.0/dns/managed/{zone}/records", a.listRecords)
	a.mux.HandleFunc("DELETE /V2.0/dns/managed/{zone}/records/{id}", a.deleteRecord)
	return a
}

// pageSize is DNS Made Easy's fixed page size for list calls.
const pageSize = 25

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !a.signed(r) {
		fail(w, http.StatusForbidden, "API key not found or signature does not match")
		return
	}
	a.mux.ServeHTTP(w, r)
}

// signed checks x-dnsme-hmac, the HMAC-SHA1 of x-dnsme-requestDate under the secret.
func (a *Account) signed(r *http.Request) bool {
	a.mu.Lock()
	secret := a.SecretKey
	a.mu.Unlock()
	if secret == "" {
		return false
	}
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(r.Header.Get("x-dnsme-requestDate")))
	want := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(r.Header.Get("x-dnsme-hmac")))
}

func (a *Account) listZones(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	ids := make([]string, 0, len(a.Zones))
	for id := range a.Zones {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	zones := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		zones = append(zones, map[string]any{"id": number(id), "name": a.Zones[id].Name})
	}
	a.mu.Unlock()
	writePage(w, zones, page(r))
}

func (a *Account) createRecord(w http.ResponseWriter, r *http.Request) {
	var in Record
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Type == "" || in.Name == "" {
		fail(w, http.StatusBadRequest, "Invalid record")
		return
	}
	zoneID := r.PathValue("zone")

	a.mu.Lock()
	zone, known := a.Zones[zoneID]
	if !known {
		a.mu.Unlock()
		fail(w, http.StatusNotFound, "Domain not found")
		return
	}
	for _, rec := range zone.Records {
		if rec.Type == in.Type && rec.Name == in.Name && rec.Value == in.Value {
			a.mu.Unlock()
			fail(w, http.StatusBadRequest, "Record with this type, name, and value already exists")
			return
		}
	}
	a.nextID++
	in.ID = a.nextID
	zone.Records = append(zone.Records, in)
	a.mu.Unlock()

	a.publishTXT(zoneID, in.Name)
	a.events.Publish(RecordCreated{Zone: zoneID, Record: in})
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(in)
}

func (a *Account) listRecords(w http.ResponseWriter, r *http.Request) {
	zoneID := r.PathValue("zone")
	q := r.URL.Query()

	a.mu.Lock()
	zone, known := a.Zones[zoneID]
	var match []Record
	if known {
		for _, rec := range zone.Records {
			if (q.Get("type") == "" || rec.Type == q.Get("type")) &&
				(q.Get("recordName") == "" || rec.Name == q.Get("recordName")) {
				match = append(match, rec)
			}
		}
	}
	a.mu.Unlock()
	if !known {
		fail(w, http.StatusNotFound, "Domain not found")
		return
	}
	writePage(w, match, page(r))
}

func (a *Account) deleteRecord(w http.ResponseWriter, r *http.Request) {
	zoneID := r.PathValue("zone")
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		fail(w, http.StatusBadRequest, "Invalid record id")
		return
	}

	a.mu.Lock()
	zone, known := a.Zones[zoneID]
	var removed *Record
	if known {
		for i, rec := range zone.Records {
			if rec.ID == id {
				removed = &rec
				zone.Records = append(zone.Records[:i:i], zone.Records[i+1:]...)
				break
			}
		}
	}
	a.mu.Unlock()

	if removed == nil {
		fail(w, http.StatusNotFound, "Record not found")
		return
	}
	a.publishTXT(zoneID, removed.Name)
	a.events.Publish(RecordDeleted{Zone: zoneID, Record: *removed})
	w.WriteHeader(http.StatusOK)
}

// publishTXT serves a zone's TXT records for one name over DNS, as DNS Made Easy's
// nameservers would. Record names are relative to the zone.
func (a *Account) publishTXT(zoneID, name string) {
	a.mu.Lock()
	zone, known := a.Zones[zoneID]
	if !known {
		a.mu.Unlock()
		return
	}
	fqdn := zone.Name
	if name != "" {
		fqdn = name + "." + zone.Name
	}
	var values []string
	for _, rec := range zone.Records {
		if rec.Type == "TXT" && rec.Name == name {
			values = append(values, strings.Trim(rec.Value, `"`))
		}
	}
	a.mu.Unlock()
	a.events.SetTXT(fqdn, values...)
}

func page(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

// writePage answers with DNS Made Easy's list envelope. Pages count from zero.
func writePage[T any](w http.ResponseWriter, items []T, page int) {
	total := len(items)
	start := min(page*pageSize, total)
	end := min(start+pageSize, total)
	data := append([]T{}, items[start:end]...)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"totalRecords": total,
		"totalPages":   max(1, (total+pageSize-1)/pageSize),
		"data":         data,
		"page":         page,
	})
}

func number(id string) any {
	if n, err := strconv.Atoi(id); err == nil {
		return n
	}
	return id
}

func fail(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string][]string{"error": {message}})
}
