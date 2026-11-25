// Package ultradns fakes the UltraDNS REST API: the password grant, the zones one user
// can reach, and their RRsets.
package ultradns

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/fakes/internal/zonefile"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Account is what one UltraDNS user reaches.
type Account struct {
	// Password is what the password grant checks. Grants are refused until it is
	// seeded, the way an unknown user's are.
	Password string `json:"password"`

	// Zones maps a zone name ("example.test.") to the zone.
	Zones map[string]*Zone `json:"zones"`

	mu       sync.Mutex
	mux      *http.ServeMux
	tokens   map[string]bool
	released bool
	events   fakenet.Emitter
}

// Zone is one primary zone and its RRsets by "<type>/<owner name>".
type Zone struct {
	RRSets map[string]*RRSet `json:"rrsets"`
}

// RRSet is every record of one owner and type, with rdata in zone file form.
type RRSet struct {
	TTL   int      `json:"ttl"`
	RData []string `json:"rdata"`
}

// WithPassword is a seed fragment setting the user's password.
func WithPassword(password string) any { return map[string]any{"password": password} }

// WithZone is a seed fragment creating an empty primary zone, named with or without
// the trailing dot.
func WithZone(name string) any {
	return map[string]any{"zones": map[string]any{zonefile.Absolute(name): map[string]any{}}}
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
		Password string           `json:"password"`
		Zones    map[string]*Zone `json:"zones"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if in.Password != "" {
		a.Password = in.Password
	}
	for name, z := range in.Zones {
		if z.RRSets == nil {
			z.RRSets = map[string]*RRSet{}
		}
		if old, ok := a.Zones[name]; ok && !a.released {
			for key, rs := range old.RRSets {
				if owner, isTXT := strings.CutPrefix(key, "TXT/"); isTXT {
					var kept []string
					if next, ok := z.RRSets[key]; ok {
						kept = txtAnswers(next.RData)
					}
					a.events.ReplaceTXT(owner, txtAnswers(rs.RData), kept...)
				}
			}
		}
		a.Zones[name] = z
	}
	return nil
}
