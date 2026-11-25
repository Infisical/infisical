// Package venaficloud fakes Venafi TLS Protect Cloud (the "Venafi" App Connection, not
// TPP): the user account check, applications with their issuing templates, certificate
// requests, and certificate contents.
//
// A request is issued as it is submitted when its application may use the template, so
// the first status check already carries the certificate id. Every template signs a CA
// certificate under the CSR's full subject, which is how Infisical has an intermediate
// signed by Venafi.
package venaficloud

import (
	"encoding/json"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
)

type service struct{}

// Service answers as api.venafi.cloud, the US region host Infisical hardcodes.
var Service = service{}

func (service) Host() string { return "api.venafi.cloud" }

// Scope is the tppl-api-key header.
func (service) Scope(r *http.Request) (string, bool) {
	key := r.Header.Get("tppl-api-key")
	return key, key != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	t := &Tenant{Applications: []Application{}, Requests: map[string]*Request{}, Certificates: map[string]*Certificate{},
		events: events, ca: issuer.New("Fake Venafi Cloud Issuing CA")}
	t.mux = http.NewServeMux()
	t.mux.HandleFunc("GET /v1/useraccounts", t.userAccounts)
	t.mux.HandleFunc("GET /outagedetection/v1/applications", t.listApplications)
	t.mux.HandleFunc("POST /outagedetection/v1/certificaterequests", t.submit)
	t.mux.HandleFunc("GET /outagedetection/v1/certificaterequests/{id}", t.getRequest)
	t.mux.HandleFunc("GET /outagedetection/v1/certificates/{id}/contents", t.contents)
	return t
}

// Tenant is what one API key reaches.
type Tenant struct {
	Applications []Application           `json:"applications"`
	Requests     map[string]*Request     `json:"requests"`
	Certificates map[string]*Certificate `json:"certificates"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	ca     *issuer.CA
}

// Application is a Venafi application and the issuing templates it may use.
type Application struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Templates []Template `json:"templates"`
}

// Template is an issuing template.
type Template struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Request is one certificate request.
type Request struct {
	ID             string   `json:"id"`
	ApplicationID  string   `json:"applicationId"`
	TemplateID     string   `json:"templateId"`
	ValidityPeriod string   `json:"validityPeriod,omitempty"`
	Status         string   `json:"status"`
	CertificateIDs []string `json:"certificateIds"`
}

// Certificate is one issued certificate.
type Certificate struct {
	ID        string `json:"id"`
	RequestID string `json:"requestId"`
	PEM       string `json:"pem"`
}

func (t *Tenant) Snapshot() ([]byte, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Root = t.ca.RootPEM()
	return json.Marshal(t)
}

func (t *Tenant) Seed(raw []byte) error {
	var in struct {
		Applications []Application `json:"applications"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Applications = append(t.Applications, in.Applications...)
	return nil
}

func (t *Tenant) ServeHTTP(w http.ResponseWriter, r *http.Request) { t.mux.ServeHTTP(w, r) }

func (t *Tenant) userAccounts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"user": map[string]any{"username": "harness@venafi.test", "userStatus": "ACTIVE"},
		"company": map[string]any{"name": "Harness"}, "apiKey": map[string]any{"key": r.Header.Get("tppl-api-key"), "apiKeyStatus": "ACTIVE"}})
}

func (t *Tenant) listApplications(w http.ResponseWriter, _ *http.Request) {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := []map[string]any{}
	for _, a := range t.Applications {
		aliases := map[string]string{}
		for _, tmpl := range a.Templates {
			aliases[tmpl.Name] = tmpl.ID
		}
		out = append(out, map[string]any{"id": a.ID, "name": a.Name, "certificateIssuingTemplateAliasIdMap": aliases})
	}
	writeJSON(w, http.StatusOK, map[string]any{"applications": out})
}

func (t *Tenant) submit(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CSR            string `json:"certificateSigningRequest"`
		ApplicationID  string `json:"applicationId"`
		TemplateID     string `json:"certificateIssuingTemplateId"`
		ValidityPeriod string `json:"validityPeriod"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, 10000, "Invalid request body")
		return
	}
	csr, err := issuer.ParseCSR(in.CSR)
	if err != nil {
		fail(w, http.StatusBadRequest, 10303, "Invalid certificate signing request: "+err.Error())
		return
	}
	t.mu.Lock()
	if _, ok := t.template(in.ApplicationID, in.TemplateID); !ok {
		t.mu.Unlock()
		fail(w, http.StatusBadRequest, 10051, "Application "+in.ApplicationID+" is not allowed to use issuing template "+in.TemplateID)
		return
	}
	days := 365
	if d, ok := strings.CutPrefix(in.ValidityPeriod, "P"); ok {
		if n, err := strconv.Atoi(strings.TrimSuffix(d, "D")); err == nil && n > 0 {
			days = n
		}
	}
	pemCert, err := t.ca.SignCA(csr, time.Now().Add(time.Duration(days)*24*time.Hour))
	if err != nil {
		t.mu.Unlock()
		fail(w, http.StatusInternalServerError, 10500, err.Error())
		return
	}
	req := &Request{ID: uuid.NewString(), ApplicationID: in.ApplicationID, TemplateID: in.TemplateID, ValidityPeriod: in.ValidityPeriod, Status: "ISSUED"}
	cert := &Certificate{ID: uuid.NewString(), RequestID: req.ID, PEM: pemCert}
	req.CertificateIDs = []string{cert.ID}
	t.Requests[req.ID], t.Certificates[cert.ID] = req, cert
	out := requestJSON(req)
	t.mu.Unlock()
	t.events.Publish(CertificateIssued{RequestID: req.ID, CertificateID: cert.ID, ApplicationID: req.ApplicationID,
		TemplateID: req.TemplateID})
	writeJSON(w, http.StatusCreated, map[string]any{"certificateRequests": []any{out}})
}

func (t *Tenant) getRequest(w http.ResponseWriter, r *http.Request) {
	t.mu.Lock()
	req := t.Requests[r.PathValue("id")]
	t.mu.Unlock()
	if req == nil {
		fail(w, http.StatusNotFound, 10022, "Certificate request "+r.PathValue("id")+" was not found")
		return
	}
	writeJSON(w, http.StatusOK, requestJSON(req))
}

func (t *Tenant) contents(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("format") != "PEM" {
		fail(w, http.StatusBadRequest, 10000, "Only the PEM format is served")
		return
	}
	t.mu.Lock()
	cert := t.Certificates[r.PathValue("id")]
	t.mu.Unlock()
	if cert == nil {
		fail(w, http.StatusNotFound, 10022, "Certificate "+r.PathValue("id")+" was not found")
		return
	}
	body := cert.PEM + t.ca.RootPEM()
	if q.Get("chainOrder") == "ROOT_FIRST" {
		body = t.ca.RootPEM() + cert.PEM
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(body))
}

// template finds a template the application may use. Called with the lock held.
func (t *Tenant) template(applicationID, templateID string) (Template, bool) {
	i := slices.IndexFunc(t.Applications, func(a Application) bool { return a.ID == applicationID })
	if i < 0 {
		return Template{}, false
	}
	j := slices.IndexFunc(t.Applications[i].Templates, func(tm Template) bool { return tm.ID == templateID })
	if j < 0 {
		return Template{}, false
	}
	return t.Applications[i].Templates[j], true
}

func requestJSON(req *Request) map[string]any {
	return map[string]any{"id": req.ID, "status": req.Status, "certificateIds": req.CertificateIDs,
		"applicationId": req.ApplicationID, "certificateIssuingTemplateId": req.TemplateID}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status, code int, message string) {
	writeJSON(w, status, map[string]any{"errors": []map[string]any{{"code": code, "message": message}}})
}
