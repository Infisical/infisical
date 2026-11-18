// Package digicert fakes the DigiCert CertCentral Services API v2: organizations, SSL
// orders with DNS TXT domain control validation, and certificate download.
//
// An order whose names all fall under a domain the account has already validated is
// issued as it is placed, the way CertCentral answers with a certificate_id. Any other
// order waits: check-dcv issues it once each name's _dnsauth TXT record, published to
// fakenet, holds the order's dcv_random_value.
package digicert

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
)

type service struct{}

// Service answers as www.digicert.com, the US CertCentral host Infisical hardcodes.
var Service = service{}

func (service) Host() string { return "www.digicert.com" }

// Scope is the X-DC-DEVKEY API key.
func (service) Scope(r *http.Request) (string, bool) {
	key := r.Header.Get("X-DC-DEVKEY")
	return key, key != ""
}

const prefix = "/services/v2"

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{
		Organizations:    []int{},
		ValidatedDomains: []string{},
		Orders:           map[int]*Order{},
		events:           events,
		ca:               issuer.New("Fake DigiCert Root CA"),
		nextID:           1000,
	}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("GET "+prefix+"/organization", a.listOrganizations)
	a.mux.HandleFunc("POST "+prefix+"/order/certificate/{product}", a.placeOrder)
	a.mux.HandleFunc("GET "+prefix+"/order/certificate/{id}", a.getOrder)
	a.mux.HandleFunc("PUT "+prefix+"/order/certificate/{id}/check-dcv", a.checkDCV)
	a.mux.HandleFunc("GET "+prefix+"/certificate/{id}/download/format/pem_all", a.download)
	return a
}

// Account is what one API key reaches.
type Account struct {
	// Organizations are the organization ids the account may order under.
	Organizations []int `json:"organizations"`
	// ValidatedDomains are domains whose control the account has already proven. An
	// order for names at or under them is issued immediately.
	ValidatedDomains []string `json:"validatedDomains"`
	// Orders by order id.
	Orders map[int]*Order `json:"orders"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	ca     *issuer.CA
	nextID int
}

// Order is one SSL order.
type Order struct {
	ID             int      `json:"id"`
	Product        string   `json:"product"`
	OrganizationID int      `json:"organizationId"`
	Status         string   `json:"status"`
	CommonName     string   `json:"commonName"`
	DNSNames       []string `json:"dnsNames"`
	DCVRandomValue string   `json:"dcvRandomValue"`
	ValidityDays   int      `json:"validityDays"`
	CertificateID  int      `json:"certificateId,omitempty"`
	Certificate    string   `json:"certificate,omitempty"`

	csr string
}

// WithOrganization seeds an organization the account may order under.
func WithOrganization(id int) any { return map[string]any{"organizations": []int{id}} }

// WithValidatedDomain seeds a domain the account has already validated.
func WithValidatedDomain(domain string) any {
	return map[string]any{"validatedDomains": []string{domain}}
}

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Root = a.ca.RootPEM()
	return json.Marshal(a)
}

func (a *Account) Seed(raw []byte) error {
	var in struct {
		Organizations    []int    `json:"organizations"`
		ValidatedDomains []string `json:"validatedDomains"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Organizations = append(a.Organizations, in.Organizations...)
	a.ValidatedDomains = append(a.ValidatedDomains, in.ValidatedDomains...)
	return nil
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *Account) listOrganizations(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	orgs := make([]map[string]any, 0, len(a.Organizations))
	for _, id := range a.Organizations {
		orgs = append(orgs, map[string]any{"id": id, "name": "Harness Org " + strconv.Itoa(id), "status": "active"})
	}
	writeJSON(w, http.StatusOK, map[string]any{"organizations": orgs, "page": map[string]any{"total": len(orgs), "limit": 0, "offset": 0}})
}

func (a *Account) placeOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Certificate struct {
			CommonName string   `json:"common_name"`
			DNSNames   []string `json:"dns_names"`
			CSR        string   `json:"csr"`
		} `json:"certificate"`
		Organization struct {
			ID int `json:"id"`
		} `json:"organization"`
		OrderValidity struct {
			Days int `json:"days"`
		} `json:"order_validity"`
		DCVMethod string `json:"dcv_method"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.")
		return
	}
	if in.Certificate.CommonName == "" || in.Certificate.CSR == "" {
		fail(w, http.StatusBadRequest, "missing_param", "common_name and csr are required.")
		return
	}
	if _, err := issuer.ParseCSR(in.Certificate.CSR); err != nil {
		fail(w, http.StatusBadRequest, "invalid_csr", "The CSR is invalid: "+err.Error())
		return
	}

	a.mu.Lock()
	if !slices.Contains(a.Organizations, in.Organization.ID) {
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "invalid_organization", "Organization "+strconv.Itoa(in.Organization.ID)+" does not exist.")
		return
	}
	a.nextID++
	o := &Order{
		ID: a.nextID, Product: r.PathValue("product"), OrganizationID: in.Organization.ID, Status: "pending",
		CommonName: in.Certificate.CommonName, DNSNames: in.Certificate.DNSNames,
		DCVRandomValue: "dcv-" + strconv.FormatInt(time.Now().UnixNano(), 36),
		ValidityDays:   in.OrderValidity.Days, csr: in.Certificate.CSR,
	}
	a.Orders[o.ID] = o
	if a.allValidated(o) {
		if err := a.issue(o); err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "issuance_failed", "The certificate could not be issued: "+err.Error())
			return
		}
	}
	domains := make([]map[string]any, 0)
	for i, n := range o.names() {
		domains = append(domains, map[string]any{"id": 5000 + i, "dns_name": n})
	}
	out := map[string]any{"id": o.ID, "domains": domains, "dcv_random_value": o.DCVRandomValue}
	if o.CertificateID != 0 {
		out["certificate_id"] = o.CertificateID
	}
	ev := OrderPlaced{OrderID: o.ID, CommonName: o.CommonName}
	issued := o.Status == "issued"
	a.mu.Unlock()

	a.events.Publish(ev)
	if issued {
		a.events.Publish(OrderIssued{OrderID: o.ID, CommonName: o.CommonName})
	}
	writeJSON(w, http.StatusCreated, out)
}

func (a *Account) getOrder(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	a.mu.Lock()
	out := map[string]any{"id": o.ID, "status": o.Status, "organization": map[string]any{"id": o.OrganizationID}, "product": map[string]any{"name_id": o.Product}, "dcv_method": "dns-txt-token"}
	if o.CertificateID != 0 {
		out["certificate"] = map[string]any{"id": o.CertificateID}
	}
	a.mu.Unlock()
	writeJSON(w, http.StatusOK, out)
}

func (a *Account) checkDCV(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	a.mu.Lock()
	validations := []map[string]any{}
	allFound := true
	for _, n := range o.names() {
		status := "pending"
		if a.validated(n) || slices.Contains(a.events.LookupTXT("_dnsauth."+n), o.DCVRandomValue) {
			status = "approved"
		} else {
			allFound = false
		}
		validations = append(validations, map[string]any{"dns_name": n, "status": status})
	}
	issuedNow := false
	if allFound && o.Status == "pending" {
		if err := a.issue(o); err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "issuance_failed", "The certificate could not be issued: "+err.Error())
			return
		}
		issuedNow = true
	}
	dcv := "pending"
	if allFound {
		dcv = "complete"
	}
	out := map[string]any{"order_status": o.Status, "dcv_status": dcv, "dns_name_validations": validations}
	if o.CertificateID != 0 {
		out["certificate_id"] = o.CertificateID
	}
	id, cn := o.ID, o.CommonName
	a.mu.Unlock()
	if issuedNow {
		a.events.Publish(OrderIssued{OrderID: id, CommonName: cn})
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *Account) download(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.mu.Lock()
	var pem string
	for _, o := range a.Orders {
		if o.CertificateID == id && id != 0 {
			pem = o.Certificate + a.ca.RootPEM()
		}
	}
	a.mu.Unlock()
	if pem == "" {
		fail(w, http.StatusNotFound, "not_found", "Certificate "+r.PathValue("id")+" was not found.")
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	_, _ = w.Write([]byte(pem))
}

func (a *Account) order(w http.ResponseWriter, r *http.Request) *Order {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.mu.Lock()
	o := a.Orders[id]
	a.mu.Unlock()
	if o == nil {
		fail(w, http.StatusNotFound, "not_found", "Order "+r.PathValue("id")+" was not found.")
	}
	return o
}

// issue signs the order's CSR. Called with the lock held.
func (a *Account) issue(o *Order) error {
	csr, err := issuer.ParseCSR(o.csr)
	if err != nil {
		return err
	}
	leaf, err := a.ca.Sign(csr, o.ValidityDays)
	if err != nil {
		return err
	}
	a.nextID++
	o.CertificateID = a.nextID
	o.Certificate = leaf.PEM
	o.Status = "issued"
	return nil
}

func (o *Order) names() []string {
	out := []string{o.CommonName}
	for _, n := range o.DNSNames {
		if !slices.Contains(out, n) {
			out = append(out, n)
		}
	}
	return out
}

func (a *Account) allValidated(o *Order) bool {
	for _, n := range o.names() {
		if !a.validated(n) {
			return false
		}
	}
	return true
}

func (a *Account) validated(name string) bool {
	for _, d := range a.ValidatedDomains {
		if name == d || strings.HasSuffix(name, "."+d) {
			return true
		}
	}
	return false
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"errors": []map[string]string{{"code": code, "message": message}}})
}
