// Package cloudflare fakes the Cloudflare v4 API: the account a token belongs to, the
// DNS records of its zones, and their custom certificates.
package cloudflare

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Account is what one API token can reach.
type Account struct {
	// ID is the account the token belongs to. A token is refused for any other.
	ID string `json:"id"`

	// Zones maps a zone id to its DNS records. A record written to a zone that is not
	// here is refused, the way Cloudflare refuses an unknown zone identifier.
	Zones map[string][]DNSRecord `json:"zones"`

	// CustomCertificates maps a zone id to the custom certificates uploaded to it.
	CustomCertificates map[string][]CustomCertificate `json:"customCertificates"`

	mu     sync.Mutex
	mux    *http.ServeMux
	nextID int
	events fakenet.Emitter
}

// DNSRecord is one record in a zone.
type DNSRecord struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Name    string `json:"name"`
	Content string `json:"content"`
	TTL     int    `json:"ttl"`
}

// WithAccount is a seed fragment naming the account the token belongs to.
func WithAccount(id string) any { return Account{ID: id} }

// WithZone is a seed fragment creating an empty zone.
func WithZone(id string) any { return Account{Zones: map[string][]DNSRecord{id: {}}} }

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		ID                 string                         `json:"id"`
		Zones              map[string][]DNSRecord         `json:"zones"`
		CustomCertificates map[string][]CustomCertificate `json:"customCertificates"`
	}{a.ID, a.Zones, a.CustomCertificates})
}

func (a *Account) Seed(raw []byte) error {
	var in struct {
		ID                 string                         `json:"id"`
		Zones              map[string][]DNSRecord         `json:"zones"`
		CustomCertificates map[string][]CustomCertificate `json:"customCertificates"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.ID != "" {
		a.ID = in.ID
	}
	for zone, records := range in.Zones {
		a.Zones[zone] = append(a.Zones[zone], records...)
	}
	for zone, certs := range in.CustomCertificates {
		a.CustomCertificates[zone] = append(a.CustomCertificates[zone], certs...)
	}
	return nil
}
