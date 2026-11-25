package cloudflare

import (
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"time"
)

// CustomCertificate is a custom certificate uploaded to a zone, as the zone's
// custom_certificates API reports it, plus the PEM bodies it was given.
type CustomCertificate struct {
	ID           string   `json:"id"`
	Type         string   `json:"type"`
	BundleMethod string   `json:"bundleMethod"`
	Hosts        []string `json:"hosts"`
	Certificate  string   `json:"certificate"`
	PrivateKey   string   `json:"privateKey"`
	ExpiresOn    string   `json:"expiresOn"`
	Updates      int      `json:"updates"`
}

type CustomCertificateDetail struct {
	Zone string `json:"zone"`
	ID   string `json:"id"`
}

type CustomCertificateCreated struct{ CustomCertificateDetail }
type CustomCertificateUpdated struct{ CustomCertificateDetail }
type CustomCertificateDeleted struct{ CustomCertificateDetail }

func (CustomCertificateCreated) EventName() string { return "cloudflare.custom-certificate-created" }
func (CustomCertificateUpdated) EventName() string { return "cloudflare.custom-certificate-updated" }
func (CustomCertificateDeleted) EventName() string { return "cloudflare.custom-certificate-deleted" }

type customCertificateBody struct {
	Certificate  string `json:"certificate"`
	PrivateKey   string `json:"private_key"`
	BundleMethod string `json:"bundle_method"`
	Type         string `json:"type"`
}

func (a *Account) customCertificateRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /client/v4/zones/{zone}/custom_certificates", a.listCustomCertificates)
	mux.HandleFunc("POST /client/v4/zones/{zone}/custom_certificates", a.createCustomCertificate)
	mux.HandleFunc("PATCH /client/v4/zones/{zone}/custom_certificates/{id}", a.patchCustomCertificate)
	mux.HandleFunc("DELETE /client/v4/zones/{zone}/custom_certificates/{id}", a.deleteCustomCertificate)
}

// leafOf finds the end-entity certificate of a PEM bundle, wherever it sits: with the
// force bundle method Cloudflare serves the upload as given, so an upload may put its
// chain before the leaf. Hosts and expiry are read from the leaf.
func leafOf(bundle string) (*x509.Certificate, bool) {
	rest := []byte(bundle)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return nil, false
		}
		if block.Type != "CERTIFICATE" {
			continue
		}
		c, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, false
		}
		if !c.IsCA {
			return c, true
		}
	}
}

func (a *Account) zoneKnown(zone string) bool {
	_, ok := a.Zones[zone]
	return ok
}

func (a *Account) listCustomCertificates(w http.ResponseWriter, r *http.Request) {
	zone := r.PathValue("zone")
	q := r.URL.Query()
	page := atLeast(q.Get("page"), 1)
	perPage := min(atLeast(q.Get("per_page"), 20), 50)
	a.mu.Lock()
	known := a.zoneKnown(zone)
	all := append([]CustomCertificate{}, a.CustomCertificates[zone]...)
	a.mu.Unlock()
	if !known {
		unknownZone(w, zone)
		return
	}
	total := len(all)
	start := total
	if page <= total {
		start = min((page-1)*perPage, total)
	}
	end := min(start+perPage, total)
	out := make([]map[string]any, 0, end-start)
	for _, c := range all[start:end] {
		out = append(out, c.wire(zone))
	}
	ok(w, out, map[string]int{
		"page":        page,
		"per_page":    perPage,
		"count":       end - start,
		"total_count": total,
		"total_pages": max(1, (total+perPage-1)/perPage),
	})
}

func (a *Account) createCustomCertificate(w http.ResponseWriter, r *http.Request) {
	zone := r.PathValue("zone")
	var in customCertificateBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, 1400, "Unable to parse the request body.")
		return
	}
	leaf, parsed := leafOf(in.Certificate)
	if !parsed {
		fail(w, http.StatusBadRequest, 1002, "The SSL certificate you uploaded is invalid.")
		return
	}
	if in.Type == "" {
		in.Type = "legacy_custom"
	}
	if in.BundleMethod == "" {
		in.BundleMethod = "ubiquitous"
	}
	a.mu.Lock()
	if !a.zoneKnown(zone) {
		a.mu.Unlock()
		unknownZone(w, zone)
		return
	}
	a.nextID++
	c := CustomCertificate{
		ID:           fmt.Sprintf("%032x", a.nextID),
		Type:         in.Type,
		BundleMethod: in.BundleMethod,
		Hosts:        leaf.DNSNames,
		Certificate:  in.Certificate,
		PrivateKey:   in.PrivateKey,
		ExpiresOn:    leaf.NotAfter.UTC().Format(time.RFC3339),
	}
	a.CustomCertificates[zone] = append(a.CustomCertificates[zone], c)
	a.mu.Unlock()
	a.events.Publish(CustomCertificateCreated{CustomCertificateDetail{Zone: zone, ID: c.ID}})
	ok(w, c.wire(zone), nil)
}

func (a *Account) patchCustomCertificate(w http.ResponseWriter, r *http.Request) {
	zone, id := r.PathValue("zone"), r.PathValue("id")
	var in customCertificateBody
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		fail(w, http.StatusBadRequest, 1400, "Unable to parse the request body.")
		return
	}
	var leaf *x509.Certificate
	if in.Certificate != "" {
		var parsed bool
		if leaf, parsed = leafOf(in.Certificate); !parsed {
			fail(w, http.StatusBadRequest, 1002, "The SSL certificate you uploaded is invalid.")
			return
		}
	}
	a.mu.Lock()
	if !a.zoneKnown(zone) {
		a.mu.Unlock()
		unknownZone(w, zone)
		return
	}
	certs := a.CustomCertificates[zone]
	i := indexOfCustomCertificate(certs, id)
	if i < 0 {
		a.mu.Unlock()
		fail(w, http.StatusNotFound, 1003, "The certificate you requested does not exist.")
		return
	}
	c := &certs[i]
	if leaf != nil {
		c.Certificate, c.Hosts, c.ExpiresOn = in.Certificate, leaf.DNSNames, leaf.NotAfter.UTC().Format(time.RFC3339)
	}
	if in.PrivateKey != "" {
		c.PrivateKey = in.PrivateKey
	}
	if in.BundleMethod != "" {
		c.BundleMethod = in.BundleMethod
	}
	c.Updates++
	out := *c
	a.mu.Unlock()
	a.events.Publish(CustomCertificateUpdated{CustomCertificateDetail{Zone: zone, ID: id}})
	ok(w, out.wire(zone), nil)
}

func (a *Account) deleteCustomCertificate(w http.ResponseWriter, r *http.Request) {
	zone, id := r.PathValue("zone"), r.PathValue("id")
	a.mu.Lock()
	if !a.zoneKnown(zone) {
		a.mu.Unlock()
		unknownZone(w, zone)
		return
	}
	certs := a.CustomCertificates[zone]
	i := indexOfCustomCertificate(certs, id)
	if i < 0 {
		a.mu.Unlock()
		fail(w, http.StatusNotFound, 1003, "The certificate you requested does not exist.")
		return
	}
	a.CustomCertificates[zone] = append(certs[:i:i], certs[i+1:]...)
	a.mu.Unlock()
	a.events.Publish(CustomCertificateDeleted{CustomCertificateDetail{Zone: zone, ID: id}})
	ok(w, map[string]string{"id": id}, nil)
}

func indexOfCustomCertificate(certs []CustomCertificate, id string) int {
	for i, c := range certs {
		if c.ID == id {
			return i
		}
	}
	return -1
}

func (c CustomCertificate) wire(zone string) map[string]any {
	return map[string]any{
		"id":            c.ID,
		"type":          c.Type,
		"hosts":         c.Hosts,
		"bundle_method": c.BundleMethod,
		"zone_id":       zone,
		"status":        "active",
		"expires_on":    c.ExpiresOn,
		"priority":      0,
	}
}
