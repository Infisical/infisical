package ultradns

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/zonefile"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

type service struct{}

// Service answers as api.ultradns.com, the production API Infisical calls by default.
var Service = service{}

func (service) Host() string { return "api.ultradns.com" }

// Scope is the username: the form field of a password grant, then the user the access
// token was issued to.
func (service) Scope(r *http.Request) (string, bool) {
	if r.URL.Path == tokenPath {
		if err := r.ParseForm(); err != nil {
			return "", false
		}
		user := r.PostForm.Get("username")
		return user, user != ""
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return "", false
	}
	_, user, ok := strings.Cut(token, ".")
	return user, ok && user != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{Zones: map[string]*Zone{}, tokens: map[string]bool{}, events: events}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("POST "+tokenPath, a.token)
	a.mux.HandleFunc("GET /v3/zones", a.authorized(a.listZones))
	a.mux.HandleFunc("GET /v1/zones/{zone}/rrsets/{type}/{owner}", a.authorized(a.getRRSet))
	a.mux.HandleFunc("POST /v1/zones/{zone}/rrsets/{type}/{owner}", a.authorized(a.createRRSet))
	a.mux.HandleFunc("PUT /v1/zones/{zone}/rrsets/{type}/{owner}", a.authorized(a.updateRRSet))
	a.mux.HandleFunc("DELETE /v1/zones/{zone}/rrsets/{type}/{owner}", a.authorized(a.deleteRRSet))
	return a
}

const tokenPath = "/v1/authorization/token"

// zonePageLimit is the most zones /v3/zones returns on one page.
const zonePageLimit = 1000

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *Account) token(w http.ResponseWriter, r *http.Request) {
	if r.PostForm.Get("grant_type") != "password" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"errorCode": 60001, "errorMessage": "unsupported_grant_type", "error": "unsupported_grant_type",
			"error_description": "60001: unsupported_grant_type",
		})
		return
	}
	a.mu.Lock()
	ok := a.Password != "" && r.PostForm.Get("password") == a.Password
	token := id.Hex(16) + "." + r.PostForm.Get("username")
	if ok {
		a.tokens[token] = true
	}
	a.mu.Unlock()
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"errorCode": 60001, "errorMessage": "invalid_grant:Invalid username & password combination.", "error": "invalid_grant",
			"error_description": "60001: invalid_grant:Invalid username & password combination.",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tokenType":    "Bearer",
		"accessToken":  token,
		"refreshToken": id.Hex(16),
		"expiresIn":    "3600",
		"expires_in":   "3600",
	})
}

// authorized refuses a bearer token the password grant did not issue.
func (a *Account) authorized(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		a.mu.Lock()
		ok := a.tokens[token]
		a.mu.Unlock()
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]any{"errorCode": 60001, "errorMessage": "invalid_grant:token not found, expired or invalid"})
			return
		}
		next(w, r)
	}
}

func (a *Account) listZones(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 100
	if raw := q.Get("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > zonePageLimit {
			fail(w, http.StatusBadRequest, 54001, "Invalid value for limit: "+raw)
			return
		}
		limit = n
	}
	offset := 0
	if raw := q.Get("cursor"); raw != "" {
		dec, err := base64.StdEncoding.DecodeString(raw)
		n, convErr := strconv.Atoi(string(dec))
		if err != nil || convErr != nil || n < 0 {
			fail(w, http.StatusBadRequest, 54001, "Invalid cursor")
			return
		}
		offset = n
	}

	a.mu.Lock()
	names := make([]string, 0, len(a.Zones))
	for name := range a.Zones {
		names = append(names, name)
	}
	sort.Strings(names)
	offset = min(offset, len(names))
	end := min(offset+limit, len(names))
	zones := make([]map[string]any, 0, end-offset)
	for _, name := range names[offset:end] {
		zones = append(zones, map[string]any{"properties": map[string]any{
			"name":                 name,
			"accountName":          a.events.Scope(),
			"type":                 "PRIMARY",
			"dnssecStatus":         "UNSIGNED",
			"status":               "ACTIVE",
			"owner":                a.events.Scope(),
			"resourceRecordCount":  len(a.Zones[name].RRSets),
			"lastModifiedDateTime": time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		}})
	}
	a.mu.Unlock()

	cursor := map[string]any{}
	if end < len(names) {
		cursor["next"] = base64.StdEncoding.EncodeToString([]byte(strconv.Itoa(end)))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"queryInfo":  map[string]any{"q": q.Get("q"), "limit": limit},
		"resultInfo": map[string]any{"totalCount": len(names), "offset": offset, "returnedCount": len(zones)},
		"zones":      zones,
		"cursorInfo": cursor,
	})
}

// rrsetOf resolves a request's zone and RRset key under the lock, or answers as
// UltraDNS does for a zone it does not have or an owner outside the zone.
func (a *Account) rrsetOf(w http.ResponseWriter, r *http.Request) (string, *Zone, string, string, bool) {
	zoneName := zonefile.Absolute(r.PathValue("zone"))
	z, ok := a.Zones[zoneName]
	if !ok {
		fail(w, http.StatusNotFound, 1801, "Zone does not exist in the system.")
		return "", nil, "", "", false
	}
	typ := r.PathValue("type")
	if typ == "16" {
		typ = "TXT"
	}
	owner := r.PathValue("owner")
	if !strings.HasSuffix(owner, ".") {
		owner += "." + zoneName
	}
	if owner != zoneName && !strings.HasSuffix(owner, "."+zoneName) {
		fail(w, http.StatusBadRequest, 2003, "Owner name "+owner+" is not within zone "+zoneName)
		return "", nil, "", "", false
	}
	return zoneName, z, typ, owner, true
}

func (a *Account) getRRSet(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	zoneName, z, typ, owner, ok := a.rrsetOf(w, r)
	if !ok {
		a.mu.Unlock()
		return
	}
	rs, found := z.RRSets[typ+"/"+owner]
	var out RRSet
	if found {
		out = *rs
	}
	a.mu.Unlock()
	if !found {
		fail(w, http.StatusNotFound, 70002, "Data not found.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"zoneName":   zoneName,
		"rrSets":     []map[string]any{{"ownerName": owner, "rrtype": rrtype(typ), "ttl": out.TTL, "rdata": out.RData}},
		"queryInfo":  map[string]any{"sort": "OWNER", "reverse": false, "limit": 100},
		"resultInfo": map[string]any{"totalCount": 1, "offset": 0, "returnedCount": 1},
	})
}

func readRRSet(w http.ResponseWriter, r *http.Request) (RRSet, bool) {
	var in struct {
		TTL   *int     `json:"ttl"`
		RData []string `json:"rdata"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, 53005, "Invalid input: the request body could not be parsed.")
		return RRSet{}, false
	}
	if len(in.RData) == 0 {
		fail(w, http.StatusBadRequest, 53005, "Invalid input: rdata is required.")
		return RRSet{}, false
	}
	ttl := 86400
	if in.TTL != nil {
		ttl = *in.TTL
	}
	return RRSet{TTL: ttl, RData: in.RData}, true
}

func (a *Account) createRRSet(w http.ResponseWriter, r *http.Request) {
	in, ok := readRRSet(w, r)
	if !ok {
		return
	}
	a.mu.Lock()
	zoneName, z, typ, owner, ok := a.rrsetOf(w, r)
	if !ok {
		a.mu.Unlock()
		return
	}
	if _, exists := z.RRSets[typ+"/"+owner]; exists {
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, 2111, "Resource Record of type "+strconv.Itoa(rrtypeCodes[typ])+" with these attributes already exists in the system.")
		return
	}
	z.RRSets[typ+"/"+owner] = &in
	a.publish(typ, owner, in.RData)
	a.mu.Unlock()

	a.events.Publish(RecordCreated{RecordDetail{Zone: zoneName, Owner: owner, Type: typ, RData: in.RData}})
	writeJSON(w, http.StatusCreated, map[string]string{"message": "Successful"})
}

func (a *Account) updateRRSet(w http.ResponseWriter, r *http.Request) {
	in, ok := readRRSet(w, r)
	if !ok {
		return
	}
	a.mu.Lock()
	zoneName, z, typ, owner, ok := a.rrsetOf(w, r)
	if !ok {
		a.mu.Unlock()
		return
	}
	if _, exists := z.RRSets[typ+"/"+owner]; !exists {
		a.mu.Unlock()
		fail(w, http.StatusNotFound, 56001, "Cannot find resource record data for the input zone, record type and owner combination.")
		return
	}
	z.RRSets[typ+"/"+owner] = &in
	a.publish(typ, owner, in.RData)
	a.mu.Unlock()

	a.events.Publish(RecordUpdated{RecordDetail{Zone: zoneName, Owner: owner, Type: typ, RData: in.RData}})
	writeJSON(w, http.StatusOK, map[string]string{"message": "Successful"})
}

func (a *Account) deleteRRSet(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	zoneName, z, typ, owner, ok := a.rrsetOf(w, r)
	if !ok {
		a.mu.Unlock()
		return
	}
	rs, exists := z.RRSets[typ+"/"+owner]
	delete(z.RRSets, typ+"/"+owner)
	if exists && typ == "TXT" && !a.released {
		a.events.ReplaceTXT(owner, txtAnswers(rs.RData))
	}
	a.mu.Unlock()
	if !exists {
		fail(w, http.StatusNotFound, 56001, "Cannot find resource record data for the input zone, record type and owner combination.")
		return
	}

	a.events.Publish(RecordDeleted{RecordDetail{Zone: zoneName, Owner: owner, Type: typ, RData: rs.RData}})
	w.WriteHeader(http.StatusNoContent)
}

// publish serves a TXT RRset over DNS as UltraDNS's nameservers would. It runs under
// a.mu so a release cannot interleave.
func (a *Account) publish(typ, owner string, rdata []string) {
	if typ == "TXT" && !a.released {
		a.events.SetTXT(owner, txtAnswers(rdata)...)
	}
}

// Release withdraws the account's TXT answers when the test removes its scope, leaving a
// name another publisher has written since. released stops a request fakenet handed the
// scope before the removal from publishing them again.
func (a *Account) Release() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.released = true
	for _, z := range a.Zones {
		for key, rs := range z.RRSets {
			if owner, ok := strings.CutPrefix(key, "TXT/"); ok {
				a.events.ReplaceTXT(owner, txtAnswers(rs.RData))
			}
		}
	}
}

// txtAnswers is what DNS serves for TXT rdata: each value with its surrounding quotes
// removed.
func txtAnswers(rdata []string) []string {
	values := make([]string, 0, len(rdata))
	for _, v := range rdata {
		if len(v) >= 2 && strings.HasPrefix(v, `"`) && strings.HasSuffix(v, `"`) {
			v = v[1 : len(v)-1]
		}
		values = append(values, v)
	}
	return values
}

var rrtypeCodes = map[string]int{"A": 1, "NS": 2, "CNAME": 5, "SOA": 6, "PTR": 12, "MX": 15, "TXT": 16, "AAAA": 28, "SRV": 33, "CAA": 257}

// rrtype is the type as UltraDNS writes it in responses, "TXT (16)".
func rrtype(typ string) string {
	if code, ok := rrtypeCodes[typ]; ok {
		return typ + " (" + strconv.Itoa(code) + ")"
	}
	return typ
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// fail answers with UltraDNS's error body: a list of codes and messages.
func fail(w http.ResponseWriter, status, code int, message string) {
	writeJSON(w, status, []map[string]any{{"errorCode": code, "errorMessage": message}})
}
