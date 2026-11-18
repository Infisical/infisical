// Package kemp fakes the access API of a Kemp LoadMaster: the certificate store and
// the separate intermediate store the served chain is built from.
package kemp

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"io"
	"maps"
	"net/http"
	"slices"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Service answers as one LoadMaster.
//
// A LoadMaster's management address is the customer's own, so no host is hardcoded in
// Infisical. A fixed .test name stands in for it and reaches this fake through
// fakenet's DNS and CA, never by pointing the connection at fakenet.
var Service = service{host: "loadmaster.kemp.test"}

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the basic auth user every call carries.
func (service) Scope(r *http.Request) (string, bool) {
	user, _, ok := r.BasicAuth()
	return user, ok && user != ""
}

// Password is the one a user a test invented logs in with.
func Password(user string) string {
	sum := sha256.Sum256([]byte("infisical-fake-kemp/" + user))
	return hex.EncodeToString(sum[:16])
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	lm := &LoadMaster{Certificates: map[string]string{}, Intermediates: map[string]string{}, events: events}
	lm.mux = http.NewServeMux()
	lm.mux.HandleFunc("GET /access/listcert", lm.listCerts)
	lm.mux.HandleFunc("POST /access/addcert", lm.addCert)
	lm.mux.HandleFunc("GET /access/delcert", lm.delCert)
	lm.mux.HandleFunc("GET /access/listintermediate", lm.listIntermediates)
	lm.mux.HandleFunc("POST /access/addintermediate", lm.addIntermediate)
	return lm
}

// LoadMaster is one appliance a user can reach.
type LoadMaster struct {
	// Certificates maps an identifier to the PEM bundle uploaded under it: the
	// certificate, any chain, and the private key.
	Certificates map[string]string `json:"certificates"`
	// Intermediates maps an identifier to one CA certificate.
	Intermediates map[string]string `json:"intermediates"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

func (lm *LoadMaster) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if user, pass, ok := r.BasicAuth(); !ok || pass != Password(user) {
		w.Header().Set("WWW-Authenticate", `Basic realm="LoadMaster"`)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	lm.mux.ServeHTTP(w, r)
}

func (lm *LoadMaster) Snapshot() ([]byte, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	return json.Marshal(struct {
		Certificates  map[string]string `json:"certificates"`
		Intermediates map[string]string `json:"intermediates"`
	}{lm.Certificates, lm.Intermediates})
}

func (lm *LoadMaster) Seed(raw []byte) error {
	var in struct {
		Certificates map[string]string `json:"certificates"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	lm.mu.Lock()
	defer lm.mu.Unlock()
	for id, pem := range in.Certificates {
		lm.Certificates[id] = pem
	}
	return nil
}

type certEntry struct {
	XMLName xml.Name `xml:"cert"`
	Name    string   `xml:"name"`
	Type    string   `xml:"type"`
}

func (lm *LoadMaster) listCerts(w http.ResponseWriter, _ *http.Request) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	writeData(w, entries(lm.Certificates))
}

func (lm *LoadMaster) listIntermediates(w http.ResponseWriter, _ *http.Request) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	writeData(w, entries(lm.Intermediates))
}

func entries(m map[string]string) any {
	out := make([]certEntry, 0, len(m))
	for _, n := range slices.Sorted(maps.Keys(m)) {
		out = append(out, certEntry{Name: n, Type: "RSA"})
	}
	return out
}

func (lm *LoadMaster) addCert(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("cert")
	replace := r.URL.Query().Get("replace") == "1"
	body, err := io.ReadAll(r.Body)
	if err != nil || id == "" || !strings.Contains(string(body), "BEGIN CERTIFICATE") || !strings.Contains(string(body), "PRIVATE KEY") {
		writeFail(w, "Invalid certificate data")
		return
	}
	lm.mu.Lock()
	_, exists := lm.Certificates[id]
	switch {
	case exists && !replace:
		lm.mu.Unlock()
		writeFail(w, "Identifier already in use")
		return
	case !exists && replace:
		lm.mu.Unlock()
		writeFail(w, "Certificate "+id+" does not exist")
		return
	}
	lm.Certificates[id] = string(body)
	lm.mu.Unlock()
	lm.events.Publish(CertificateAdded{Name: id, Replaced: replace})
	writeOK(w, "Command completed ok")
}

func (lm *LoadMaster) delCert(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("cert")
	lm.mu.Lock()
	if _, ok := lm.Certificates[id]; !ok {
		lm.mu.Unlock()
		writeFail(w, "Certificate "+id+" does not exist")
		return
	}
	delete(lm.Certificates, id)
	lm.mu.Unlock()
	lm.events.Publish(CertificateDeleted{Name: id})
	writeOK(w, "Command completed ok")
}

func (lm *LoadMaster) addIntermediate(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("cert")
	body, err := io.ReadAll(r.Body)
	if err != nil || id == "" || !strings.Contains(string(body), "BEGIN CERTIFICATE") {
		writeFail(w, "Invalid certificate data")
		return
	}
	lm.mu.Lock()
	if _, exists := lm.Intermediates[id]; exists {
		lm.mu.Unlock()
		writeFail(w, "Certificate "+id+" already exists")
		return
	}
	lm.Intermediates[id] = string(body)
	lm.mu.Unlock()
	lm.events.Publish(IntermediateAdded{Name: id})
	writeOK(w, "Command completed ok")
}

func writeData(w http.ResponseWriter, data any) {
	inner, err := xml.Marshal(data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/xml")
	_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<Response stat="200" code="ok"><Success><Data>`+string(inner)+`</Data></Success></Response>`)
}

func writeOK(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "text/xml")
	_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<Response stat="200" code="ok"><Success>`+escape(message)+`</Success></Response>`)
}

// writeFail answers the way the LoadMaster does: HTTP 422 and a fail document.
func writeFail(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "text/xml")
	w.WriteHeader(http.StatusUnprocessableEntity)
	_, _ = io.WriteString(w, `<?xml version="1.0" encoding="UTF-8"?>`+"\n"+`<Response stat="422" code="fail"><Error>`+escape(message)+`</Error></Response>`)
}

func escape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}
