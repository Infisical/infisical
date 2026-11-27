// Package powerdns fakes the PowerDNS Authoritative Server's HTTP API (/api/v1): the
// zones one API key reaches and their RRsets.
package powerdns

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/fakes/internal/zonefile"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Server is what one API key reaches: one server, "localhost", as the Authoritative
// Server always reports itself.
type Server struct {
	// KeyAccepted says the server's api-key setting is this key. Requests are refused
	// until it is seeded, the way a wrong key is.
	KeyAccepted bool `json:"keyAccepted"`

	// Zones maps a zone id, its canonical name ("example.test."), to the zone.
	Zones map[string]*Zone `json:"zones"`

	mu       sync.Mutex
	mux      *http.ServeMux
	released bool
	events   fakenet.Emitter
}

// Zone is one zone and its RRsets.
type Zone struct {
	Name   string  `json:"name"`
	Serial int     `json:"serial"`
	RRSets []RRSet `json:"rrsets"`
}

// RRSet is every record of one name and type.
type RRSet struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"`
	TTL      int      `json:"ttl"`
	Records  []Record `json:"records"`
	Comments []any    `json:"comments"`
}

// Record is one record's content in zone file form, a TXT value quoted.
type Record struct {
	Content  string `json:"content"`
	Disabled bool   `json:"disabled"`
}

// WithKeyAccepted is a seed fragment making the server accept the key.
func WithKeyAccepted() any { return map[string]any{"keyAccepted": true} }

// WithZone is a seed fragment creating an empty zone, named with or without the
// trailing dot.
func WithZone(name string) any {
	id := zonefile.Absolute(name)
	return map[string]any{"zones": map[string]any{id: map[string]any{"name": id, "serial": 1}}}
}

func (s *Server) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return json.Marshal(struct {
		KeyAccepted bool             `json:"keyAccepted"`
		Zones       map[string]*Zone `json:"zones"`
	}{s.KeyAccepted, s.Zones})
}

func (s *Server) Seed(raw []byte) error {
	var in struct {
		KeyAccepted bool             `json:"keyAccepted"`
		Zones       map[string]*Zone `json:"zones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.KeyAccepted = s.KeyAccepted || in.KeyAccepted
	for id, z := range in.Zones {
		if z.RRSets == nil {
			z.RRSets = []RRSet{}
		}
		if old, ok := s.Zones[id]; ok && !s.released {
			for _, rs := range old.RRSets {
				if rs.Type == "TXT" {
					s.events.ReplaceTXT(rs.Name, txtAnswers(old.RRSets, rs.Name), txtAnswers(z.RRSets, rs.Name)...)
				}
			}
		}
		s.Zones[id] = z
	}
	return nil
}
