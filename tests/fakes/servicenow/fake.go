package servicenow

import (
	"encoding/json"
	"net/http"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Service answers as one ServiceNow instance.
//
// An instance URL is always the customer's own, so unlike GitHub there is no name the
// client has hardcoded. A real name under service-now.com still reaches this fake only
// through fakenet's DNS and CA, never by pointing the connection at fakenet itself.
var Service = service{host: "harness.service-now.com"}

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the integration user, which basic auth carries on every call.
func (service) Scope(r *http.Request) (string, bool) {
	user, _, ok := r.BasicAuth()
	return user, ok
}

func (service) New(fakenet.Emitter) fakenet.Fake {
	in := &Instance{UserSysID: "6816f79cc0a8016401c5a33be04be441"}
	in.mux = in.routes()
	return in
}

func (in *Instance) ServeHTTP(w http.ResponseWriter, r *http.Request) { in.mux.ServeHTTP(w, r) }

func (in *Instance) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// Creating a ServiceNow App Connection calls this to check the credential works,
	// so the fake answers it by existing rather than because a test registered anything.
	mux.HandleFunc("GET /api/now/ui/user/current_user", in.currentUser)

	return mux
}

func (in *Instance) currentUser(w http.ResponseWriter, r *http.Request) {
	user, _, _ := r.BasicAuth()
	in.mu.Lock()
	defer in.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"result": map[string]any{"user_name": user, "user_sys_id": in.UserSysID},
	})
}

func (in *Instance) Snapshot() ([]byte, error) {
	in.mu.Lock()
	defer in.mu.Unlock()
	return json.Marshal(in)
}

// Seed merges a partial instance in, so a test names only what it cares about.
func (in *Instance) Seed(raw []byte) error {
	var seed Instance
	if err := json.Unmarshal(raw, &seed); err != nil {
		return err
	}

	in.mu.Lock()
	defer in.mu.Unlock()
	if seed.UserSysID != "" {
		in.UserSysID = seed.UserSysID
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
