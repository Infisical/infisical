// Package godaddy fakes GoDaddy's Certificates API v1: placing a DV certificate order,
// reading its status, downloading the issued bundle, renewing it in its renewal window,
// and revoking it.
//
// An order waits in PENDING_ISSUANCE until each of its names has a _dnsauth TXT record,
// published to fakenet, holding the order's domain verification token; GoDaddy checks
// domain control on its own, so the fake checks whenever the order is read.
package godaddy

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/fakes/internal/issuer"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

type service struct{}

// Service answers as api.godaddy.com, the host Infisical hardcodes.
var Service = service{}

func (service) Host() string { return "api.godaddy.com" }

// Scope is the API key of the sso-key Authorization header.
func (service) Scope(r *http.Request) (string, bool) {
	key, _, ok := credentials(r)
	return key, ok
}

// APISecret is the secret paired with an API key a test invented. GoDaddy refuses the
// key with any other.
func APISecret(apiKey string) string { return "secret-" + apiKey }

func credentials(r *http.Request) (string, string, bool) {
	raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "sso-key ")
	if !ok {
		return "", "", false
	}
	key, secret, ok := strings.Cut(raw, ":")
	return key, secret, ok && key != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{Certificates: map[string]*Certificate{}, events: events, ca: issuer.New("Fake GoDaddy Root CA")}
	a.mux = http.NewServeMux()
	a.mux.HandleFunc("POST /v1/certificates", a.create)
	a.mux.HandleFunc("GET /v1/certificates/{id}", a.get)
	a.mux.HandleFunc("GET /v1/certificates/{id}/download", a.download)
	a.mux.HandleFunc("POST /v1/certificates/{id}/renew", a.renew)
	a.mux.HandleFunc("POST /v1/certificates/{id}/revoke", a.revoke)
	return a
}

// Account is what one API key reaches.
type Account struct {
	// Certificates by certificate id.
	Certificates map[string]*Certificate `json:"certificates"`
	// Root is the CA that signs every certificate, in PEM.
	Root string `json:"root"`
	// ValidityDays, when set, is how long issued certificates are valid instead of the
	// order's period in years, so a test can hold a certificate that is near expiry.
	ValidityDays int `json:"validityDays,omitempty"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	ca     *issuer.CA
}

// Certificate is one certificate order.
type Certificate struct {
	ID          string   `json:"id"`
	Status      string   `json:"status"`
	ProductType string   `json:"productType"`
	CommonName  string   `json:"commonName"`
	SANs        []string `json:"subjectAlternativeNames"`
	Period      int      `json:"period"`
	// DomainToken is what each name's _dnsauth TXT record has to hold.
	DomainToken string `json:"domainToken"`
	PEM         string `json:"pem,omitempty"`
	Serial      string `json:"serial,omitempty"`
	// NotAfter is when the current certificate expires.
	NotAfter time.Time `json:"notAfter,omitempty"`
	// Renewals counts accepted renewals of this certificate id.
	Renewals         int    `json:"renewals,omitempty"`
	RevocationReason string `json:"revocationReason,omitempty"`

	csr string
}

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.Root = a.ca.RootPEM()
	return json.Marshal(a)
}

// WithValidityDays makes certificates issued from now on valid for days, standing in
// for a certificate ordered long ago that is now near expiry.
func WithValidityDays(days int) any { return map[string]any{"validityDays": days} }

// Seed sets how long issued certificates are valid; every certificate is one a client
// ordered.
func (a *Account) Seed(raw []byte) error {
	var in struct {
		ValidityDays int `json:"validityDays"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.ValidityDays > 0 {
		a.ValidityDays = in.ValidityDays
	}
	return nil
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key, secret, _ := credentials(r)
	if secret != APISecret(key) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	a.mux.ServeHTTP(w, r)
}

func (a *Account) create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CommonName  string   `json:"commonName"`
		CSR         string   `json:"csr"`
		Period      int      `json:"period"`
		ProductType string   `json:"productType"`
		SANs        []string `json:"subjectAlternativeNames"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusUnprocessableEntity, "INVALID_BODY", "Request body doesn't fulfill schema")
		return
	}
	if in.CommonName == "" || in.ProductType == "" || in.Period < 1 {
		fail(w, http.StatusUnprocessableEntity, "MISSING_FIELD", "commonName, productType and period are required")
		return
	}
	if _, err := issuer.ParseCSR(in.CSR); err != nil {
		fail(w, http.StatusUnprocessableEntity, "INVALID_CSR", "The CSR is invalid: "+err.Error())
		return
	}
	c := &Certificate{ID: id.Hex(12), Status: "PENDING_ISSUANCE", ProductType: in.ProductType, CommonName: in.CommonName,
		SANs: in.SANs, Period: in.Period, DomainToken: id.Hex(12), csr: in.CSR}
	a.mu.Lock()
	a.Certificates[c.ID] = c
	a.mu.Unlock()
	a.events.Publish(CertificateOrdered{CertificateID: c.ID, CommonName: c.CommonName})
	writeJSON(w, http.StatusAccepted, map[string]string{"certificateId": c.ID})
}

func (a *Account) get(w http.ResponseWriter, r *http.Request) {
	c := a.lookup(w, r)
	if c == nil {
		return
	}
	a.mu.Lock()
	issuedNow := c.Status == "PENDING_ISSUANCE" && a.verified(c)
	if issuedNow {
		if err := a.issue(c); err != nil {
			a.mu.Unlock()
			fail(w, http.StatusInternalServerError, "ISSUANCE_FAILED", "The certificate could not be issued: "+err.Error())
			return
		}
	}
	out := map[string]any{"certificateId": c.ID, "status": c.Status, "commonName": c.CommonName, "productType": c.ProductType}
	if c.Serial != "" {
		out["serialNumber"] = c.Serial
		out["validEnd"] = c.NotAfter.Format(time.RFC3339)
	}
	id, cn := c.ID, c.CommonName
	a.mu.Unlock()
	if issuedNow {
		a.events.Publish(CertificateIssued{CertificateID: id, CommonName: cn})
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *Account) download(w http.ResponseWriter, r *http.Request) {
	c := a.lookup(w, r)
	if c == nil {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if c.PEM == "" {
		fail(w, http.StatusConflict, "CERTIFICATE_NOT_ISSUED", "The certificate has not been issued yet")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pems": map[string]string{"certificate": c.PEM, "root": a.ca.RootPEM()}, "serialNumber": c.Serial})
}

func (a *Account) lookup(w http.ResponseWriter, r *http.Request) *Certificate {
	a.mu.Lock()
	c := a.Certificates[r.PathValue("id")]
	a.mu.Unlock()
	if c == nil {
		fail(w, http.StatusNotFound, "NOT_FOUND", "Certificate not found")
	}
	return c
}

// verified reports whether every name proves control. Called with the lock held.
func (a *Account) verified(c *Certificate) bool {
	for _, n := range append([]string{c.CommonName}, c.SANs...) {
		if !slices.Contains(a.events.LookupTXT("_dnsauth."+n), c.DomainToken) {
			return false
		}
	}
	return true
}

// issue signs the order's CSR. Called with the lock held.
func (a *Account) issue(c *Certificate) error {
	csr, err := issuer.ParseCSR(c.csr)
	if err != nil {
		return err
	}
	days := 365 * c.Period
	if a.ValidityDays > 0 {
		days = a.ValidityDays
	}
	leaf, err := a.ca.Sign(csr, days)
	if err != nil {
		return err
	}
	c.PEM, c.Serial, c.Status = leaf.PEM, leaf.Serial, "ISSUED"
	c.NotAfter = time.Now().Add(time.Duration(days) * 24 * time.Hour).UTC()
	return nil
}

// RenewalOpensDays and RenewalClosesDays bound GoDaddy's renewal window around a
// certificate's expiry.
const (
	RenewalOpensDays  = 60
	RenewalClosesDays = 30
)

// renew re-keys the certificate under the same id. It waits in PENDING_ISSUANCE for
// domain control like a new order.
func (a *Account) renew(w http.ResponseWriter, r *http.Request) {
	c := a.lookup(w, r)
	if c == nil {
		return
	}
	var in struct {
		CommonName string `json:"commonName"`
		CSR        string `json:"csr"`
		Period     int    `json:"period"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusUnprocessableEntity, "INVALID_BODY", "Request body doesn't fulfill schema")
		return
	}
	if _, err := issuer.ParseCSR(in.CSR); err != nil {
		fail(w, http.StatusUnprocessableEntity, "INVALID_CSR", "The CSR is invalid: "+err.Error())
		return
	}
	a.mu.Lock()
	if status := c.Status; status != "ISSUED" {
		a.mu.Unlock()
		fail(w, http.StatusConflict, "INVALID_STATUS", "Only an issued certificate can be renewed; this one is "+status)
		return
	}
	now := time.Now()
	if now.Before(c.NotAfter.AddDate(0, 0, -RenewalOpensDays)) || now.After(c.NotAfter.AddDate(0, 0, RenewalClosesDays)) {
		a.mu.Unlock()
		fail(w, http.StatusConflict, "RENEWAL_NOT_ALLOWED", "The certificate can only be renewed from 60 days before to 30 days after it expires")
		return
	}
	c.Status, c.csr, c.Renewals = "PENDING_ISSUANCE", in.CSR, c.Renewals+1
	if in.Period > 0 {
		c.Period = in.Period
	}
	id, cn := c.ID, c.CommonName
	a.mu.Unlock()
	a.events.Publish(CertificateRenewalRequested{CertificateID: id, CommonName: cn})
	w.WriteHeader(http.StatusAccepted)
}

var revocationReasons = []string{"AFFILIATION_CHANGED", "CESSATION_OF_OPERATION", "KEY_COMPROMISE", "PRIVILEGE_WITHDRAWN", "SUPERSEDED"}

func (a *Account) revoke(w http.ResponseWriter, r *http.Request) {
	c := a.lookup(w, r)
	if c == nil {
		return
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !slices.Contains(revocationReasons, in.Reason) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{"code": "INVALID_BODY", "message": "Request body doesn't fulfill schema",
			"fields": []map[string]string{{"path": "reason", "code": "INVALID_VALUE", "message": "reason must be one of " + strings.Join(revocationReasons, ", ")}}})
		return
	}
	a.mu.Lock()
	if status := c.Status; status != "ISSUED" {
		a.mu.Unlock()
		fail(w, http.StatusConflict, "INVALID_STATUS", "Only an issued certificate can be revoked; this one is "+status)
		return
	}
	c.Status, c.RevocationReason = "REVOKED", in.Reason
	id, cn := c.ID, c.CommonName
	a.mu.Unlock()
	a.events.Publish(CertificateRevoked{CertificateID: id, CommonName: cn, Reason: in.Reason})
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]string{"code": code, "message": message})
}
