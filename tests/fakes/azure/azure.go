// Package azure fakes the Microsoft identity platform's signing keys, which Infisical
// fetches to verify a machine identity's Azure managed identity token.
//
// The tenant id in the path is the scope. A test generates a key pair, publishes the
// certificate here, and signs the managed identity token itself.
package azure

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

var Service = service{host: "login.microsoftonline.com"}

type service struct{ host string }

func (s service) Host() string { return s.host }

func (service) Scope(r *http.Request) (string, bool) {
	tenant, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	return tenant, tenant != ""
}

func (service) New(_ fakenet.Emitter) fakenet.Fake {
	t := &Tenant{}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{tenant}/discovery/keys", t.keys)
	t.mux = mux
	return t
}

// Tenant is one Entra tenant's published signing keys.
type Tenant struct {
	Keys []Key `json:"keys"`

	mu  sync.Mutex
	mux *http.ServeMux
}

// Key is a signing key as Entra publishes it: x5c holds the base64 DER certificate.
type Key struct {
	Kty string   `json:"kty"`
	Use string   `json:"use"`
	Kid string   `json:"kid"`
	X5c []string `json:"x5c"`
}

func (t *Tenant) ServeHTTP(w http.ResponseWriter, r *http.Request) { t.mux.ServeHTTP(w, r) }

func (t *Tenant) keys(w http.ResponseWriter, _ *http.Request) {
	t.mu.Lock()
	keys := t.Keys
	t.mu.Unlock()
	if keys == nil {
		keys = []Key{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"keys": keys})
}

func (t *Tenant) Snapshot() ([]byte, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return json.Marshal(struct {
		Keys []Key `json:"keys"`
	}{t.Keys})
}

func (t *Tenant) Seed(raw []byte) error {
	var in struct {
		Keys []Key `json:"keys"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Keys = append(t.Keys, in.Keys...)
	return nil
}

// ControlPlane is a test's view of one tenant.
type ControlPlane struct {
	*fakenet.Scope[Tenant]
	TenantID string
}

func Open(tt *testing.T, adminURL, tenantID string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{Scope: fakenet.Open[Tenant](tt, adminURL, Service.Host(), tenantID), TenantID: tenantID}
}

// Publish makes a certificate's key trusted for this tenant's tokens.
func (cp *ControlPlane) Publish(tt *testing.T, kid, certDERBase64 string) {
	tt.Helper()
	cp.Seed(tt, map[string]any{"keys": []Key{{Kty: "RSA", Use: "sig", Kid: kid, X5c: []string{certDERBase64}}}})
}
