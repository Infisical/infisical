// Package digicert fakes the DigiCert CertCentral Services API v2: organizations and
// their validations, products, SSL orders with DNS TXT domain control validation,
// renewals and reissues, certificate and order revocation,
// order status changes, and certificate download.
//
// An order whose names all fall under a domain the account has already validated is
// issued as it is placed, the way CertCentral answers with a certificate_id. Any other
// order waits: check-dcv issues it once each name's _dnsauth TXT record, published to
// fakenet, holds the order's dcv_random_value, and the names it proved count as
// validated from then on. Reissues follow the same rule.
//
// The order's names, not the CSR's, go on the certificate, as CertCentral does.
package digicert

import (
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"regexp"
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

// MaxCertificateValidityDays caps how long an issued certificate is valid, whatever
// validity the order asks for.
const MaxCertificateValidityDays = 199

// Products is what every account may order, by name_id, with its type.
var Products = map[string]string{
	"ssl_basic":           "ssl_certificate",
	"ssl_plus":            "ssl_certificate",
	"ssl_multi_domain":    "ssl_certificate",
	"ssl_wildcard":        "ssl_certificate",
	"ssl_ev_basic":        "ssl_certificate",
	"ssl_ev_plus":         "ssl_certificate",
	"ssl_ev_multi_domain": "ssl_certificate",
	"code_signing":        "code_signing_certificate",
	"code_signing_ev":     "code_signing_certificate",
}

var dcvMethods = []string{"email", "dns-txt-token", "dns-cname-token", "http-token"}

var dnsName = regexp.MustCompile(`^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$`)

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{
		Organizations:           []int{},
		OrganizationValidations: map[string][]Validation{},
		ValidatedDomains:        []string{},
		Orders:                  map[int]*Order{},
		Certificates:            map[int]*Certificate{},
		events:                  events,
		ca:                      issuer.New("Fake DigiCert Root CA"),
		nextID:                  1000,
	}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("GET "+prefix+"/organization", a.listOrganizations)
	a.mux.HandleFunc("GET "+prefix+"/organization/{id}/validation", a.organizationValidations)
	a.mux.HandleFunc("GET "+prefix+"/product", a.listProducts)
	a.mux.HandleFunc("POST "+prefix+"/order/certificate/{product}", a.placeOrder)
	a.mux.HandleFunc("GET "+prefix+"/order/certificate/status-changes", a.statusChanges)
	a.mux.HandleFunc("GET "+prefix+"/order/certificate/{id}", a.getOrder)
	a.mux.HandleFunc("PUT "+prefix+"/order/certificate/{id}/check-dcv", a.checkDCV)
	a.mux.HandleFunc("POST "+prefix+"/order/certificate/{id}/reissue", a.reissue)
	a.mux.HandleFunc("PUT "+prefix+"/order/certificate/{id}/status", a.updateStatus)
	a.mux.HandleFunc("PUT "+prefix+"/order/certificate/{id}/revoke", a.revokeOrder)
	a.mux.HandleFunc("GET "+prefix+"/order/alternate/{alt}", a.alternateOrders)
	a.mux.HandleFunc("PUT "+prefix+"/certificate/{id}/revoke", a.revokeCertificate)
	a.mux.HandleFunc("GET "+prefix+"/certificate/{id}/download/format/pem_all", a.download)
	return a
}

// Account is what one API key reaches.
type Account struct {
	// Organizations are the organization ids the account may order under.
	Organizations []int `json:"organizations"`
	// OrganizationValidations are each organization's validations, by organization id.
	OrganizationValidations map[string][]Validation `json:"organizationValidations"`
	// ValidatedDomains are domains whose control the account has already proven. An
	// order for names at or under them is issued immediately.
	ValidatedDomains []string `json:"validatedDomains"`
	// Orders by order id.
	Orders map[int]*Order `json:"orders"`
	// Certificates by certificate id, every one ever issued on any order.
	Certificates map[int]*Certificate `json:"certificates"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	ca     *issuer.CA
	nextID int
}

// Validation is one validation an organization holds, such as "ov" or "cs".
type Validation struct {
	Type           string `json:"type"`
	Status         string `json:"status"`
	ValidatedUntil string `json:"validated_until,omitempty"`
}

// Order is one SSL order.
type Order struct {
	ID                 int      `json:"id"`
	Product            string   `json:"product"`
	OrganizationID     int      `json:"organizationId"`
	Status             string   `json:"status"`
	CommonName         string   `json:"commonName"`
	DNSNames           []string `json:"dnsNames"`
	DCVMethod          string   `json:"dcvMethod"`
	DCVRandomValue     string   `json:"dcvRandomValue"`
	ValidityDays       int      `json:"validityDays"`
	SignatureHash      string   `json:"signatureHash,omitempty"`
	RenewalOfOrderID   int      `json:"renewalOfOrderId,omitempty"`
	AlternativeOrderID string   `json:"alternativeOrderId,omitempty"`
	// RenewalIneligible makes a renewal of this order refused.
	RenewalIneligible bool `json:"renewalIneligible,omitempty"`
	// CertificateID is the order's current certificate.
	CertificateID int `json:"certificateId,omitempty"`
	// Certificate is the current certificate in PEM, copied from Certificates on Snapshot.
	Certificate string `json:"certificate,omitempty"`
	// Reissues counts reissues requested on the order.
	Reissues int `json:"reissues,omitempty"`
	// PendingReissue is a reissue waiting for validation, while Status is reissue_pending.
	PendingReissue *Reissue `json:"pendingReissue,omitempty"`
	// StatusChangedAt is when Status last changed, for the status-changes feed.
	StatusChangedAt time.Time `json:"statusChangedAt"`

	csr string
}

// Reissue is the request a reissue was placed with.
type Reissue struct {
	CommonName            string   `json:"commonName"`
	DNSNames              []string `json:"dnsNames"`
	ValidityDays          int      `json:"validityDays"`
	PreviousCertificateID int      `json:"previousCertificateId"`

	csr string
}

// Certificate is one certificate DigiCert issued on an order.
type Certificate struct {
	ID        int        `json:"id"`
	OrderID   int        `json:"orderId"`
	Status    string     `json:"status"`
	Serial    string     `json:"serial"`
	PEM       string     `json:"pem"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
	Comments  string     `json:"comments,omitempty"`
}

// WithOrganization seeds an organization the account may order under.
func WithOrganization(id int) any { return map[string]any{"organizations": []int{id}} }

// WithValidatedDomain seeds a domain the account has already validated.
func WithValidatedDomain(domain string) any {
	return map[string]any{"validatedDomains": []string{domain}}
}

// WithoutValidatedDomain withdraws a domain's validation, as its reuse period ending
// does, so the next order or reissue for it waits for DCV again.
func WithoutValidatedDomain(domain string) any {
	return map[string]any{"removeValidatedDomains": []string{domain}}
}

// WithOrganizationValidation seeds a validation, such as "cs" with status "active", on
// an organization.
func WithOrganizationValidation(org int, typ, status string) any {
	return map[string]any{"organizationValidations": map[string][]Validation{strconv.Itoa(org): {{Type: typ, Status: status}}}}
}

// RenewalIneligible makes CertCentral refuse a renewal of the order.
func RenewalIneligible(orderID int) any { return map[string]any{"renewalIneligible": []int{orderID}} }

// IssuedOrder is an order placed and issued in CertCentral itself, outside Infisical,
// for a certificate a test then imports.
type IssuedOrder struct {
	Product        string   `json:"product"`
	OrganizationID int      `json:"organizationId"`
	CommonName     string   `json:"commonName"`
	DNSNames       []string `json:"dnsNames,omitempty"`
	CSR            string   `json:"csr"`
}

// WithIssuedOrder seeds an order issued in CertCentral for a CSR the test made.
func WithIssuedOrder(o IssuedOrder) any { return map[string]any{"issuedOrders": []IssuedOrder{o}} }

// RevokeOrder revokes an order's current certificate as an administrator would in
// CertCentral, so it shows in the status-changes feed.
func RevokeOrder(orderID int) any { return map[string]any{"revokeOrders": []int{orderID}} }

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Root = a.ca.RootPEM()
	for _, o := range a.Orders {
		if cert := a.Certificates[o.CertificateID]; cert != nil {
			o.Certificate = cert.PEM
		}
	}
	return json.Marshal(a)
}

func (a *Account) Seed(raw []byte) error {
	var in struct {
		Organizations           []int                   `json:"organizations"`
		OrganizationValidations map[string][]Validation `json:"organizationValidations"`
		ValidatedDomains        []string                `json:"validatedDomains"`
		RemoveValidatedDomains  []string                `json:"removeValidatedDomains"`
		RenewalIneligible       []int                   `json:"renewalIneligible"`
		RevokeOrders            []int                   `json:"revokeOrders"`
		IssuedOrders            []IssuedOrder           `json:"issuedOrders"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	var publish []fakenet.Event
	a.mu.Lock()
	a.Organizations = append(a.Organizations, in.Organizations...)
	for org, vs := range in.OrganizationValidations {
		a.OrganizationValidations[org] = append(a.OrganizationValidations[org], vs...)
	}
	a.ValidatedDomains = append(a.ValidatedDomains, in.ValidatedDomains...)
	a.ValidatedDomains = slices.DeleteFunc(a.ValidatedDomains, func(d string) bool { return slices.Contains(in.RemoveValidatedDomains, d) })
	for _, id := range in.RenewalIneligible {
		if o := a.Orders[id]; o != nil {
			o.RenewalIneligible = true
		}
	}
	for _, seed := range in.IssuedOrders {
		a.nextID++
		o := &Order{ID: a.nextID, Product: seed.Product, OrganizationID: seed.OrganizationID, Status: "pending",
			CommonName: seed.CommonName, DNSNames: seed.DNSNames, DCVMethod: "dns-txt-token", ValidityDays: MaxCertificateValidityDays,
			StatusChangedAt: time.Now(), csr: seed.CSR}
		a.Orders[o.ID] = o
		if _, err := a.complete(o); err != nil {
			a.mu.Unlock()
			return err
		}
	}
	for _, id := range in.RevokeOrders {
		if o := a.Orders[id]; o != nil && o.CertificateID != 0 {
			publish = append(publish, a.revoke(a.Certificates[o.CertificateID], "Revoked in CertCentral"))
		}
	}
	a.mu.Unlock()
	for _, ev := range publish {
		a.events.Publish(ev)
	}
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

func (a *Account) organizationValidations(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.mu.Lock()
	defer a.mu.Unlock()
	if !slices.Contains(a.Organizations, id) {
		fail(w, http.StatusNotFound, "not_found", "Organization "+r.PathValue("id")+" was not found.")
		return
	}
	vs := a.OrganizationValidations[strconv.Itoa(id)]
	if vs == nil {
		vs = []Validation{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"validations": vs})
}

func (a *Account) listProducts(w http.ResponseWriter, _ *http.Request) {
	ids := make([]string, 0, len(Products))
	for id := range Products {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	out := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		out = append(out, map[string]any{"name_id": id, "name": id, "type": Products[id]})
	}
	writeJSON(w, http.StatusOK, map[string]any{"products": out})
}

type certificateRequest struct {
	CommonName    string   `json:"common_name"`
	DNSNames      []string `json:"dns_names"`
	CSR           string   `json:"csr"`
	SignatureHash string   `json:"signature_hash"`
	CertValidity  struct {
		Days int `json:"days"`
	} `json:"cert_validity"`
}

// checkNames validates the names a request puts on the certificate.
func checkNames(w http.ResponseWriter, c certificateRequest) bool {
	if c.CommonName == "" || c.CSR == "" {
		fail(w, http.StatusBadRequest, "missing_param", "common_name and csr are required.")
		return false
	}
	for _, n := range append([]string{c.CommonName}, c.DNSNames...) {
		if !dnsName.MatchString(n) {
			fail(w, http.StatusBadRequest, "invalid_dns_name", "The name '"+n+"' is not a valid domain name.")
			return false
		}
	}
	if _, err := issuer.ParseCSR(c.CSR); err != nil {
		fail(w, http.StatusBadRequest, "invalid_csr", "The CSR is invalid: "+err.Error())
		return false
	}
	return true
}

func (a *Account) placeOrder(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Certificate  certificateRequest `json:"certificate"`
		Organization struct {
			ID int `json:"id"`
		} `json:"organization"`
		OrderValidity struct {
			Days int `json:"days"`
		} `json:"order_validity"`
		DCVMethod          string `json:"dcv_method"`
		RenewalOfOrderID   int    `json:"renewal_of_order_id"`
		AlternativeOrderID string `json:"alternative_order_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.")
		return
	}
	product := r.PathValue("product")
	switch Products[product] {
	case "":
		fail(w, http.StatusBadRequest, "invalid_product", "Product '"+product+"' is not available for this account.")
		return
	case "code_signing_certificate":
		fail(w, http.StatusBadRequest, "invalid_product", "Product '"+product+"' is a code signing product; this fake models SSL orders only.")
		return
	}
	if !checkNames(w, in.Certificate) {
		return
	}
	if in.DCVMethod == "" {
		in.DCVMethod = "email"
	}
	if !slices.Contains(dcvMethods, in.DCVMethod) {
		fail(w, http.StatusBadRequest, "invalid_dcv_method", "dcv_method must be one of "+strings.Join(dcvMethods, ", ")+".")
		return
	}
	if in.OrderValidity.Days < 1 {
		fail(w, http.StatusBadRequest, "invalid_order_validity", "order_validity is required.")
		return
	}

	a.mu.Lock()
	if !slices.Contains(a.Organizations, in.Organization.ID) {
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "invalid_organization", "Organization "+strconv.Itoa(in.Organization.ID)+" does not exist.")
		return
	}
	if in.RenewalOfOrderID != 0 {
		prev := a.Orders[in.RenewalOfOrderID]
		if prev == nil || prev.RenewalIneligible || prev.Product != product || (prev.Status != "issued" && prev.Status != "expired") {
			a.mu.Unlock()
			fail(w, http.StatusBadRequest, "order_not_eligible_for_renewal", "Order "+strconv.Itoa(in.RenewalOfOrderID)+" is not eligible for renewal.")
			return
		}
	}
	a.nextID++
	o := &Order{
		ID: a.nextID, Product: product, OrganizationID: in.Organization.ID, Status: "pending",
		CommonName: in.Certificate.CommonName, DNSNames: in.Certificate.DNSNames, DCVMethod: in.DCVMethod,
		DCVRandomValue: "dcv-" + strconv.FormatInt(time.Now().UnixNano(), 36), ValidityDays: in.OrderValidity.Days,
		SignatureHash: in.Certificate.SignatureHash, RenewalOfOrderID: in.RenewalOfOrderID,
		AlternativeOrderID: in.AlternativeOrderID, StatusChangedAt: time.Now(), csr: in.Certificate.CSR,
	}
	a.Orders[o.ID] = o
	var issued *fakenet.Event
	if a.allValidated(o.names()) {
		ev, err := a.complete(o)
		if err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "issuance_failed", "The certificate could not be issued: "+err.Error())
			return
		}
		issued = ev
	}
	domains := make([]map[string]any, 0)
	for i, n := range o.names() {
		domains = append(domains, map[string]any{"id": 5000 + i, "dns_name": n})
	}
	out := map[string]any{"id": o.ID, "domains": domains, "dcv_random_value": o.DCVRandomValue}
	if o.CertificateID != 0 {
		out["certificate_id"] = o.CertificateID
	}
	placed := OrderPlaced{OrderID: o.ID, CommonName: o.CommonName, Product: product, RenewalOfOrderID: o.RenewalOfOrderID}
	a.mu.Unlock()

	a.events.Publish(placed)
	if issued != nil {
		a.events.Publish(*issued)
	}
	writeJSON(w, http.StatusCreated, out)
}

func (a *Account) getOrder(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	a.mu.Lock()
	out := map[string]any{"id": o.ID, "status": o.Status, "organization": map[string]any{"id": o.OrganizationID},
		"product": map[string]any{"name_id": o.Product}, "dcv_method": o.DCVMethod}
	if o.CertificateID != 0 {
		out["certificate"] = map[string]any{"id": o.CertificateID, "common_name": o.CommonName, "dns_names": o.names()}
	}
	if o.AlternativeOrderID != "" {
		out["alternative_order_id"] = o.AlternativeOrderID
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
	names := o.names()
	if o.PendingReissue != nil {
		names = o.PendingReissue.names()
	}
	validations := []map[string]any{}
	allFound := true
	for _, n := range names {
		status := "pending"
		if a.validated(n) || (o.DCVMethod == "dns-txt-token" && slices.Contains(a.events.LookupTXT("_dnsauth."+n), o.DCVRandomValue)) {
			status = "approved"
		} else {
			allFound = false
		}
		validations = append(validations, map[string]any{"dns_name": n, "status": status})
	}
	var issued *fakenet.Event
	if allFound {
		for _, n := range names {
			if !a.validated(n) {
				a.ValidatedDomains = append(a.ValidatedDomains, n)
			}
		}
		ev, err := a.complete(o)
		if err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "issuance_failed", "The certificate could not be issued: "+err.Error())
			return
		}
		issued = ev
	}
	dcv := "pending"
	if allFound {
		dcv = "complete"
	}
	out := map[string]any{"order_status": o.Status, "dcv_status": dcv, "dns_name_validations": validations}
	if o.CertificateID != 0 {
		out["certificate_id"] = o.CertificateID
	}
	a.mu.Unlock()
	if issued != nil {
		a.events.Publish(*issued)
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *Account) reissue(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	var in struct {
		Certificate certificateRequest `json:"certificate"`
		DCVMethod   string             `json:"dcv_method"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.")
		return
	}
	if !checkNames(w, in.Certificate) {
		return
	}
	if in.DCVMethod != "" && !slices.Contains(dcvMethods, in.DCVMethod) {
		fail(w, http.StatusBadRequest, "invalid_dcv_method", "dcv_method must be one of "+strings.Join(dcvMethods, ", ")+".")
		return
	}
	a.mu.Lock()
	switch o.Status {
	case "issued":
	case "reissue_pending":
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "reissue_pending", "Order "+strconv.Itoa(o.ID)+" already has a pending reissue.")
		return
	default:
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "invalid_order_status", "Order "+strconv.Itoa(o.ID)+" is "+o.Status+" and can't be reissued.")
		return
	}
	days := in.Certificate.CertValidity.Days
	if days < 1 {
		days = o.ValidityDays
	}
	o.Reissues++
	o.PendingReissue = &Reissue{CommonName: in.Certificate.CommonName, DNSNames: in.Certificate.DNSNames, ValidityDays: days,
		PreviousCertificateID: o.CertificateID, csr: in.Certificate.CSR}
	o.setStatus("reissue_pending")
	requested := ReissueRequested{OrderID: o.ID, PreviousCertificateID: o.CertificateID}
	var issued *fakenet.Event
	if a.allValidated(o.PendingReissue.names()) {
		ev, err := a.complete(o)
		if err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "issuance_failed", "The certificate could not be issued: "+err.Error())
			return
		}
		issued = ev
	}
	out := map[string]any{"id": o.ID}
	if o.Status == "issued" {
		out["certificate_id"] = o.CertificateID
	}
	a.mu.Unlock()
	a.events.Publish(requested)
	if issued != nil {
		a.events.Publish(*issued)
	}
	writeJSON(w, http.StatusCreated, out)
}

// updateStatus cancels a pending order or a pending reissue, which leaves the order
// issued with the certificate it had.
func (a *Account) updateStatus(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	var in struct {
		Status string `json:"status"`
		Note   string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.")
		return
	}
	if in.Status != "canceled" {
		fail(w, http.StatusBadRequest, "invalid_status", "status can only be set to canceled.")
		return
	}
	a.mu.Lock()
	switch o.Status {
	case "reissue_pending":
		o.PendingReissue = nil
		o.setStatus("issued")
	case "pending":
		o.setStatus("canceled")
	default:
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "invalid_status_change", "Order "+strconv.Itoa(o.ID)+" is "+o.Status+" and can't be canceled.")
		return
	}
	ev := OrderCanceled{OrderID: o.ID, Status: o.Status, Note: in.Note}
	a.mu.Unlock()
	a.events.Publish(ev)
	w.WriteHeader(http.StatusNoContent)
}

func (a *Account) revokeOrder(w http.ResponseWriter, r *http.Request) {
	o := a.order(w, r)
	if o == nil {
		return
	}
	a.mu.Lock()
	cert := a.Certificates[o.CertificateID]
	a.mu.Unlock()
	a.revokeNow(w, r, cert, o.ID)
}

func (a *Account) revokeCertificate(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.mu.Lock()
	cert := a.Certificates[id]
	a.mu.Unlock()
	if cert == nil {
		fail(w, http.StatusNotFound, "not_found", "Certificate "+r.PathValue("id")+" was not found.")
		return
	}
	a.revokeNow(w, r, cert, cert.OrderID)
}

// revokeNow revokes at once and answers 204, as CertCentral does when approval is
// skipped or the account does not require it.
func (a *Account) revokeNow(w http.ResponseWriter, r *http.Request, cert *Certificate, orderID int) {
	var in struct {
		Comments string `json:"comments"`
	}
	if raw, _ := io.ReadAll(r.Body); len(raw) > 0 {
		if err := json.Unmarshal(raw, &in); err != nil {
			fail(w, http.StatusBadRequest, "invalid_json", "The request body is not valid JSON.")
			return
		}
	}
	a.mu.Lock()
	if cert == nil {
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "invalid_order_status", "Order "+strconv.Itoa(orderID)+" has no issued certificate to revoke.")
		return
	}
	if cert.Status == "revoked" {
		a.mu.Unlock()
		fail(w, http.StatusBadRequest, "already_revoked", "Certificate "+strconv.Itoa(cert.ID)+" is already revoked.")
		return
	}
	ev := a.revoke(cert, in.Comments)
	a.mu.Unlock()
	a.events.Publish(ev)
	w.WriteHeader(http.StatusNoContent)
}

// statusChanges lists orders whose status changed in the last `seconds` seconds.
func (a *Account) statusChanges(w http.ResponseWriter, r *http.Request) {
	seconds, err := strconv.Atoi(r.URL.Query().Get("seconds"))
	if err != nil || seconds < 1 {
		fail(w, http.StatusBadRequest, "invalid_param", "seconds must be a positive integer.")
		return
	}
	since := time.Now().Add(-time.Duration(seconds) * time.Second)
	a.mu.Lock()
	out := []map[string]any{}
	for _, o := range a.sortedOrders() {
		if o.StatusChangedAt.After(since) {
			out = append(out, map[string]any{"order_id": o.ID, "certificate_id": o.CertificateID, "status": o.Status})
		}
	}
	a.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (a *Account) alternateOrders(w http.ResponseWriter, r *http.Request) {
	alt := r.PathValue("alt")
	a.mu.Lock()
	out := []map[string]any{}
	for _, o := range a.sortedOrders() {
		if o.AlternativeOrderID == alt {
			entry := map[string]any{"order_id": o.ID, "status": o.Status}
			if o.CertificateID != 0 {
				entry["certificate_id"] = o.CertificateID
			}
			out = append(out, entry)
		}
	}
	a.mu.Unlock()
	if len(out) == 0 {
		fail(w, http.StatusNotFound, "not_found", "No orders have the alternative order id "+alt+".")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": out})
}

func (a *Account) download(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(r.PathValue("id"))
	a.mu.Lock()
	cert := a.Certificates[id]
	a.mu.Unlock()
	if cert == nil {
		fail(w, http.StatusNotFound, "not_found", "Certificate "+r.PathValue("id")+" was not found.")
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	_, _ = w.Write([]byte(cert.PEM + a.ca.RootPEM()))
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

func (a *Account) sortedOrders() []*Order {
	out := make([]*Order, 0, len(a.Orders))
	for _, o := range a.Orders {
		out = append(out, o)
	}
	slices.SortFunc(out, func(x, y *Order) int { return x.ID - y.ID })
	return out
}

// complete issues a pending order or its pending reissue, returning the event to
// publish, or nil when there is nothing pending. Called with the lock held.
func (a *Account) complete(o *Order) (*fakenet.Event, error) {
	var ev fakenet.Event
	switch {
	case o.Status == "pending":
		cert, err := a.sign(o.ID, o.CommonName, o.DNSNames, o.csr, o.ValidityDays)
		if err != nil {
			return nil, err
		}
		o.CertificateID = cert.ID
		ev = OrderIssued{OrderID: o.ID, CommonName: o.CommonName, CertificateID: cert.ID}
	case o.Status == "reissue_pending" && o.PendingReissue != nil:
		re := o.PendingReissue
		cert, err := a.sign(o.ID, re.CommonName, re.DNSNames, re.csr, re.ValidityDays)
		if err != nil {
			return nil, err
		}
		o.CertificateID = cert.ID
		o.CommonName, o.DNSNames, o.PendingReissue = re.CommonName, re.DNSNames, nil
		ev = OrderReissued{OrderID: o.ID, CertificateID: cert.ID, PreviousCertificateID: re.PreviousCertificateID}
	default:
		return nil, nil
	}
	o.setStatus("issued")
	return &ev, nil
}

// sign issues a certificate for the order's names over the CSR's key. Called with the
// lock held.
func (a *Account) sign(orderID int, commonName string, dnsNames []string, csrPEM string, days int) (*Certificate, error) {
	csr, err := issuer.ParseCSR(csrPEM)
	if err != nil {
		return nil, err
	}
	if days < 1 || days > MaxCertificateValidityDays {
		days = MaxCertificateValidityDays
	}
	names := []string{commonName}
	for _, n := range dnsNames {
		if !slices.Contains(names, n) {
			names = append(names, n)
		}
	}
	serial := new(big.Int).SetInt64(time.Now().UnixNano())
	serial.Lsh(serial, 16).Add(serial, big.NewInt(int64(a.nextID)))
	der, err := a.ca.Create(&x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: commonName},
		DNSNames:     names,
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Duration(days) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
	}, csr.PublicKey)
	if err != nil {
		return nil, err
	}
	a.nextID++
	cert := &Certificate{ID: a.nextID, OrderID: orderID, Status: "issued", Serial: serial.Text(16), PEM: issuer.PEM(der)}
	a.Certificates[cert.ID] = cert
	return cert, nil
}

// revoke revokes a certificate, and its order when it is the order's current one.
// Called with the lock held.
func (a *Account) revoke(cert *Certificate, comments string) fakenet.Event {
	now := time.Now().UTC()
	cert.Status, cert.RevokedAt, cert.Comments = "revoked", &now, comments
	if o := a.Orders[cert.OrderID]; o != nil && o.CertificateID == cert.ID {
		o.setStatus("revoked")
	}
	return CertificateRevoked{CertificateID: cert.ID, OrderID: cert.OrderID, Comments: comments}
}

func (o *Order) setStatus(status string) {
	o.Status, o.StatusChangedAt = status, time.Now()
}

func (o *Order) names() []string { return uniqueNames(o.CommonName, o.DNSNames) }

func (re *Reissue) names() []string { return uniqueNames(re.CommonName, re.DNSNames) }

func uniqueNames(cn string, dns []string) []string {
	out := []string{cn}
	for _, n := range dns {
		if !slices.Contains(out, n) {
			out = append(out, n)
		}
	}
	return out
}

func (a *Account) allValidated(names []string) bool {
	for _, n := range names {
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
