// Package dnsmadeeasy fakes the DNS Made Easy V2.0 API: the managed zones an API key
// can reach and their records.
package dnsmadeeasy

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Account is what one API key can reach.
type Account struct {
	// SecretKey is what every request's x-dnsme-hmac is checked against. Requests are
	// refused until it is seeded, the way an unknown key is.
	SecretKey string `json:"secretKey"`

	// Zones maps a managed zone id to its records.
	Zones map[string]*Zone `json:"zones"`

	mu     sync.Mutex
	mux    *http.ServeMux
	nextID int
	events fakenet.Emitter
}

// Zone is one managed domain.
type Zone struct {
	Name    string   `json:"name"`
	Records []Record `json:"records"`
}

// Record is one record in a zone.
type Record struct {
	ID    int    `json:"id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	Value string `json:"value"`
	TTL   int    `json:"ttl"`
}

// WithSecretKey is a seed fragment setting the key's secret.
func WithSecretKey(secret string) any { return Account{SecretKey: secret} }

// WithZone is a seed fragment creating an empty managed zone.
func WithZone(id, name string) any {
	return Account{Zones: map[string]*Zone{id: {Name: name, Records: []Record{}}}}
}

func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Zones map[string]*Zone `json:"zones"`
	}{a.Zones})
}

func (a *Account) Seed(raw []byte) error {
	var in struct {
		SecretKey string           `json:"secretKey"`
		Zones     map[string]*Zone `json:"zones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.SecretKey != "" {
		a.SecretKey = in.SecretKey
	}
	for id, z := range in.Zones {
		if z.Records == nil {
			z.Records = []Record{}
		}
		a.Zones[id] = z
	}
	return nil
}
