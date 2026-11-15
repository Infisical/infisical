package servicenow

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Service answers as one ServiceNow instance.
//
// An instance URL is always the customer's own, so unlike GitHub there is no name the
// client has hardcoded. A real name under service-now.com still reaches this fake only
// through fakenet's DNS and CA, never by pointing the connection at fakenet itself.
var Service = service{host: "harness.service-now.com"}

// accessRequestPath is the Scripted REST API the Infisical Approvals application serves.
const accessRequestPath = "/api/x_infis_approvals/v1/infisical/access_request"

type service struct{ host string }

func (s service) Host() string { return s.host }

// Scope is the integration user, which basic auth carries on every call.
func (service) Scope(r *http.Request) (string, bool) {
	user, _, ok := r.BasicAuth()
	return user, ok
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	in := &Instance{
		UserSysID:      "6816f79cc0a8016401c5a33be04be441",
		AccessRequests: map[string]*AccessRequest{},
		events:         events,
	}
	in.mux = in.routes()
	return in
}

func (in *Instance) ServeHTTP(w http.ResponseWriter, r *http.Request) { in.mux.ServeHTTP(w, r) }

func (in *Instance) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// Creating a ServiceNow App Connection calls this to check the credential works,
	// so the fake answers it by existing rather than because a test registered anything.
	mux.HandleFunc("GET /api/now/ui/user/current_user", in.currentUser)

	mux.HandleFunc("POST "+accessRequestPath, in.createAccessRequest)
	mux.HandleFunc("GET "+accessRequestPath+"/{sysID}", in.readAccessRequest)

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

func (in *Instance) createAccessRequest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RequestID      string   `json:"request_id"`
		CallbackURL    string   `json:"callback_url"`
		CallbackToken  string   `json:"callback_token"`
		Environment    string   `json:"environment"`
		SecretPath     string   `json:"secret_path"`
		RequestorEmail string   `json:"requestor_email"`
		Permissions    []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "Request body is not valid JSON")
		return
	}
	if body.RequestID == "" || body.CallbackURL == "" || body.CallbackToken == "" {
		writeError(w, http.StatusBadRequest, "request_id, callback_url and callback_token are required")
		return
	}

	in.mu.Lock()
	defer in.mu.Unlock()

	// The application keeps one record per request_id, so a resend after a lost
	// response gets back the record it already made instead of a second one.
	for _, rec := range in.AccessRequests {
		if rec.RequestID == body.RequestID {
			writeJSON(w, http.StatusConflict, map[string]any{"result": map[string]any{"sys_id": rec.SysID}})
			return
		}
	}

	rec := &AccessRequest{
		SysID:          newSysID(),
		RequestID:      body.RequestID,
		CallbackURL:    body.CallbackURL,
		CallbackToken:  body.CallbackToken,
		Environment:    body.Environment,
		SecretPath:     body.SecretPath,
		RequestorEmail: body.RequestorEmail,
		Permissions:    body.Permissions,
	}
	in.AccessRequests[rec.SysID] = rec
	in.events.Publish(AccessRequestCreated{rec.detail()})
	writeJSON(w, http.StatusCreated, map[string]any{"result": map[string]any{"sys_id": rec.SysID}})
}

func (in *Instance) readAccessRequest(w http.ResponseWriter, r *http.Request) {
	in.mu.Lock()
	defer in.mu.Unlock()

	rec, ok := in.AccessRequests[r.PathValue("sysID")]
	if !ok {
		writeError(w, http.StatusNotFound, "No Record found")
		return
	}

	state := rec.State
	switch {
	case state != "":
	case rec.Decision != "":
		state = "callback_pending"
	default:
		state = "pending"
	}
	in.events.Publish(AccessRequestRead{rec.detail()})
	writeJSON(w, http.StatusOK, map[string]any{"result": map[string]any{
		"success": true,
		"data": map[string]any{
			"sys_id":         rec.SysID,
			"request_id":     rec.RequestID,
			"permissions":    strings.Join(rec.Permissions, "\n"),
			"state":          state,
			"decision":       nullable(rec.Decision),
			"decision_notes": nullable(rec.DecisionNotes),
		},
	}})
}

func (in *Instance) Snapshot() ([]byte, error) {
	in.mu.Lock()
	defer in.mu.Unlock()
	return json.Marshal(in)
}

// Seed merges a partial instance in, so a test names only what it cares about. A
// record is only ever changed here, never created: Infisical is what creates them.
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
	for sysID, decided := range seed.AccessRequests {
		rec, ok := in.AccessRequests[sysID]
		if !ok {
			return fmt.Errorf("servicenow fake: no access request %q to decide", sysID)
		}
		rec.Decision, rec.DecisionNotes, rec.State = decided.Decision, decided.DecisionNotes, decided.State
	}
	return nil
}

// newSysID is shaped like ServiceNow's: 32 lowercase hex characters.
func newSysID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// nullable reports an empty field as null, which is how ServiceNow sends one.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"message": msg}, "status": "failure"})
}
