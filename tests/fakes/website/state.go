// Package website fakes the web server behind a domain a test makes up: the party an
// ACME HTTP-01 challenge asks to prove control of a name.
//
// Every name under web.test resolves to fakenet and is served here over plain HTTP on
// port 80, which is where HTTP-01 looks. A test names its domains under a scope of its
// own (<label>.<scope>.web.test), so parallel tenants never share a site.
package website

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Site is every domain under one scope.
type Site struct {
	// Challenges maps an HTTP-01 token to the key authorization the site serves for it.
	Challenges map[string]string `json:"challenges"`

	// Fetches is every challenge request the site answered, oldest first.
	Fetches []Fetch `json:"fetches"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// Fetch is one challenge request, with the status the site answered.
type Fetch struct {
	Host      string    `json:"host"`
	Token     string    `json:"token"`
	Status    int       `json:"status"`
	FetchedAt time.Time `json:"fetchedAt"`
}

// Challenge is a seed fragment that publishes a key authorization for a token.
func Challenge(token, keyAuthorization string) any {
	return Site{Challenges: map[string]string{token: keyAuthorization}}
}

func (s *Site) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return json.Marshal(struct {
		Challenges map[string]string `json:"challenges"`
		Fetches    []Fetch           `json:"fetches"`
	}{s.Challenges, s.Fetches})
}

// Seed adds challenges. Fetches are not seedable: they are only ever what Infisical
// asked for.
func (s *Site) Seed(raw []byte) error {
	var in struct {
		Challenges map[string]string `json:"challenges"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for token, keyAuth := range in.Challenges {
		s.Challenges[token] = keyAuth
	}
	return nil
}
