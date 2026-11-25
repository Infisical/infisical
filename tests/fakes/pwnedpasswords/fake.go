// Package pwnedpasswords fakes the Have I Been Pwned range API, which Infisical asks
// whether a new password has appeared in a data breach.
//
// The API has no credential and is keyed by the first five hex characters of the
// password's SHA-1, so that prefix is the scope: a test with its own password gets its
// own range.
package pwnedpasswords

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

type service struct{}

// Service answers for api.pwnedpasswords.com.
var Service = service{}

func (service) Host() string { return "api.pwnedpasswords.com" }

func (service) Scope(r *http.Request) (string, bool) {
	prefix, ok := strings.CutPrefix(r.URL.Path, "/range/")
	return strings.ToUpper(prefix), ok && len(prefix) == 5
}

func (service) New(fakenet.Emitter) fakenet.Fake { return &Range{Suffixes: map[string]int{}} }

// Range is one hash prefix: each suffix under it and the number of breaches it was seen in.
type Range struct {
	Suffixes map[string]int `json:"suffixes"`

	mu sync.Mutex
}

func (rg *Range) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rg.mu.Lock()
	defer rg.mu.Unlock()
	w.Header().Set("Content-Type", "text/plain")
	for suffix, count := range rg.Suffixes {
		_, _ = fmt.Fprintf(w, "%s:%d\r\n", suffix, count)
	}
}

func (rg *Range) Snapshot() ([]byte, error) {
	rg.mu.Lock()
	defer rg.mu.Unlock()
	return json.Marshal(struct {
		Suffixes map[string]int `json:"suffixes"`
	}{rg.Suffixes})
}

func (rg *Range) Seed(raw []byte) error {
	var in struct {
		Suffixes map[string]int `json:"suffixes"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	rg.mu.Lock()
	defer rg.mu.Unlock()
	for suffix, count := range in.Suffixes {
		rg.Suffixes[strings.ToUpper(suffix)] = count
	}
	return nil
}
