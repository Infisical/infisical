package cloudflare

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers as api.cloudflare.com, the host Infisical hardcodes.
var Service = service{}

func (service) Host() string { return "api.cloudflare.com" }

// Scope is the bearer API token.
func (service) Scope(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return token, ok && token != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{Zones: map[string][]DNSRecord{}, events: events}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("GET /client/v4/accounts/{account}", a.getAccount)
	a.mux.HandleFunc("POST /client/v4/zones/{zone}/dns_records", a.createRecord)
	a.mux.HandleFunc("GET /client/v4/zones/{zone}/dns_records", a.listRecords)
	a.mux.HandleFunc("DELETE /client/v4/zones/{zone}/dns_records/{id}", a.deleteRecord)
	return a
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *Account) getAccount(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	id := a.ID
	a.mu.Unlock()
	if id == "" || r.PathValue("account") != id {
		fail(w, http.StatusForbidden, 9109, "Unauthorized to access requested resource")
		return
	}
	ok(w, map[string]any{"id": id, "name": "Harness account", "type": "standard"}, nil)
}

func (a *Account) createRecord(w http.ResponseWriter, r *http.Request) {
	var in DNSRecord
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Type == "" || in.Name == "" {
		fail(w, http.StatusBadRequest, 9207, "Request body is invalid.")
		return
	}
	zone := r.PathValue("zone")

	a.mu.Lock()
	records, known := a.Zones[zone]
	if !known {
		a.mu.Unlock()
		unknownZone(w, zone)
		return
	}
	a.nextID++
	in.ID = fmt.Sprintf("%032x", a.nextID)
	a.Zones[zone] = append(records, in)
	a.mu.Unlock()

	a.publishTXT(in.Name)
	a.events.Publish(DNSRecordCreated{Zone: zone, DNSRecord: in})
	ok(w, in, nil)
}

func (a *Account) listRecords(w http.ResponseWriter, r *http.Request) {
	zone := r.PathValue("zone")
	q := r.URL.Query()
	page := atLeast(q.Get("page"), 1)
	perPage := atLeast(q.Get("per_page"), 100)

	a.mu.Lock()
	records, known := a.Zones[zone]
	var match []DNSRecord
	for _, rec := range records {
		if (q.Get("type") == "" || rec.Type == q.Get("type")) &&
			(q.Get("name") == "" || rec.Name == q.Get("name")) &&
			(q.Get("content") == "" || rec.Content == q.Get("content")) {
			match = append(match, rec)
		}
	}
	a.mu.Unlock()
	if !known {
		unknownZone(w, zone)
		return
	}

	total := len(match)
	start := min((page-1)*perPage, total)
	end := min(start+perPage, total)
	ok(w, append([]DNSRecord{}, match[start:end]...), map[string]int{
		"page":        page,
		"per_page":    perPage,
		"count":       end - start,
		"total_count": total,
		"total_pages": max(1, (total+perPage-1)/perPage),
	})
}

func (a *Account) deleteRecord(w http.ResponseWriter, r *http.Request) {
	zone, id := r.PathValue("zone"), r.PathValue("id")

	a.mu.Lock()
	records, known := a.Zones[zone]
	var removed *DNSRecord
	for i, rec := range records {
		if rec.ID == id {
			removed = &rec
			a.Zones[zone] = append(records[:i:i], records[i+1:]...)
			break
		}
	}
	a.mu.Unlock()

	switch {
	case !known:
		unknownZone(w, zone)
	case removed == nil:
		fail(w, http.StatusNotFound, 81044, "Record does not exist.")
	default:
		a.publishTXT(removed.Name)
		a.events.Publish(DNSRecordDeleted{Zone: zone, DNSRecord: *removed})
		ok(w, map[string]string{"id": id}, nil)
	}
}

// publishTXT serves every TXT record named name over DNS, as Cloudflare's
// nameservers would once a record is created.
func (a *Account) publishTXT(name string) {
	a.mu.Lock()
	var values []string
	for _, records := range a.Zones {
		for _, rec := range records {
			if rec.Type == "TXT" && rec.Name == name {
				values = append(values, strings.Trim(rec.Content, `"`))
			}
		}
	}
	a.mu.Unlock()
	a.events.SetTXT(name, values...)
}

func atLeast(raw string, fallback int) int {
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return fallback
	}
	return n
}

func ok(w http.ResponseWriter, result any, info map[string]int) {
	body := map[string]any{"success": true, "errors": []any{}, "messages": []any{}, "result": result}
	if info != nil {
		body["result_info"] = info
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": false, "messages": []any{}, "result": nil,
		"errors": []map[string]any{{"code": code, "message": message}},
	})
}

func unknownZone(w http.ResponseWriter, zone string) {
	fail(w, http.StatusNotFound, 7003, "Could not route to /zones/"+zone+"/dns_records, perhaps your object identifier is invalid?")
}
