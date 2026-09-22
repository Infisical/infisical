package license

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Host is where the License Server lives as far as the instance is concerned.
//
// A name nobody owns. fakenet answers DNS for every hostname, so this needs no
// registration anywhere; it just has to be a name the real product would never
// reach by accident.
const Host = "license.infisical.test"

// Service answers as the License Server.
var Service = service{}

type service struct{}

func (service) Host() string { return Host }

// Scope is the organization in the path.
//
// Entitlements are per organization, which is the whole reason the harness runs in
// Cloud mode, so the organization is the natural unit of state here rather than a
// credential. The instance-wide endpoints carry no organization and share one scope.
func (service) Scope(r *http.Request) (string, bool) {
	if org := orgFromPath(r.URL.Path); org != "" {
		return org, true
	}
	return "instance", true
}

// New returns a fully entitled organization.
//
// Entitled by default, and that is not a convenience. On any failure getPlan writes
// the OSS defaults into the plan cache for the full TTL rather than leaving it
// empty, so a single unanswered call poisons that organization for about fifteen
// minutes. With the default in the fake there is nothing to install and no window in
// which an organization can be asked about before the answer exists.
func (service) New() fakenet.Fake { return &Org{plan: Enterprise()} }

// Org is one organization's entitlements.
type Org struct {
	mu   sync.Mutex
	plan Plan
	mux  *http.ServeMux
}

func (o *Org) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	o.mu.Lock()
	if o.mux == nil {
		o.mux = o.routes()
	}
	mux := o.mux
	o.mu.Unlock()
	mux.ServeHTTP(w, r)
}

func (o *Org) routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /v1/organizations/{orgId}/entitlements", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		payload := o.plan.Payload()
		o.mu.Unlock()
		writeJSON(w, payload)
	})

	// Deleting an organization cancels its subscription, and the delete fails if
	// that call does. Every tenant registers its own removal on t.Cleanup, so
	// without this each test leaks its organization into the shared database for
	// the life of the run. The outcome is parsed rather than ignored, so an empty
	// body is not enough.
	mux.HandleFunc("POST /v1/organizations/{orgId}/subscription/cancel", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"outcome": "subscription_canceled"})
	})

	// The usage reporter authenticates against the same server. Nothing asserts on
	// these, but an unanswered call is a failed request path and noise in the logs.
	for _, p := range []string{"GET /v1/products", "GET /v1/subscription"} {
		mux.HandleFunc(p, func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, map[string]any{})
		})
	}
	return mux
}

func (o *Org) Snapshot() ([]byte, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	return json.Marshal(o.plan)
}

// Seed replaces the plan outright. Entitlements are not additive: a downgrade is the
// case worth testing, and merging would make it unexpressible.
func (o *Org) Seed(raw []byte) error {
	var p Plan
	if err := json.Unmarshal(raw, &p); err != nil {
		return err
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	o.plan = p
	return nil
}

// orgFromPath pulls the id out of /v1/organizations/{id}/...
func orgFromPath(path string) string {
	const prefix = "/v1/organizations/"
	if len(path) <= len(prefix) || path[:len(prefix)] != prefix {
		return ""
	}
	rest := path[len(prefix):]
	for i := range len(rest) {
		if rest[i] == '/' {
			return rest[:i]
		}
	}
	return rest
}

func writeJSON(w http.ResponseWriter, body any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(body)
}
