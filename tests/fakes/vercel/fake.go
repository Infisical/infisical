package vercel

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Service answers for api.vercel.com, the base URL Infisical hardcodes.
var Service = service{}

type service struct{}

func (service) Host() string { return "api.vercel.com" }

// Scope is the API token. Two tenants writing to the same project id at the same time
// are told apart by what they authenticate with.
func (service) Scope(r *http.Request) (string, bool) {
	return strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	a := &Account{Username: "harness", Projects: map[string]*Project{}, events: events}
	a.mux = a.routes()
	return a
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *Account) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// Creating a Vercel app connection calls this to check the token works, so the fake
	// answers it by existing rather than because a test registered anything.
	mux.HandleFunc("GET /v2/user", a.user)

	// The project routes a project-scope secret sync uses. Vercel versions each route on
	// its own, which is why create is v10 while the rest are v9.
	mux.HandleFunc("GET /v9/projects/{project}/env", a.list)
	mux.HandleFunc("GET /v9/projects/{project}/env/{id}", a.get)
	mux.HandleFunc("POST /v10/projects/{project}/env", a.create)
	mux.HandleFunc("PATCH /v9/projects/{project}/env/{id}", a.update)
	mux.HandleFunc("DELETE /v9/projects/{project}/env/{id}", a.remove)

	return mux
}

// keyPattern is Vercel's rule for an environment variable name: letters, digits, and
// underscores, not starting with a digit.
var keyPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// The error Vercel answers a create with when the name breaks keyPattern. The backend
// treats this code as one that can never succeed, so it must not retry the sync.
const (
	invalidKeyCode    = "env_key_invalid_characters"
	invalidKeyMessage = "The name of your Environment Variable contains invalid characters. Only letters, digits, and underscores are allowed. Furthermore, the name should not start with a digit."
)

func (a *Account) user(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{"id": "user_harness", "username": a.Username, "email": a.Username + "@vercel.test"},
	})
}

// list answers the way Vercel does: an encrypted variable's value is ciphertext here,
// which is why the product reads each one again by id to get the plaintext, and a
// sensitive one has no value at all.
func (a *Account) list(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	p := a.project(r.PathValue("project"))

	out := make([]map[string]any, 0, len(p.Envs))
	for _, e := range p.Envs {
		out = append(out, envJSON(e, listedValue(e)))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"envs":       out,
		"pagination": map[string]any{"count": len(out), "next": nil, "prev": nil},
	})
}

func (a *Account) get(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	e, _, ok := a.find(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "Environment Variable not found")
		return
	}
	value := e.Value
	if e.Type == "sensitive" {
		value = ""
	}
	writeJSON(w, http.StatusOK, envJSON(*e, value))
}

type envBody struct {
	Key                  *string  `json:"key"`
	Value                *string  `json:"value"`
	Type                 string   `json:"type"`
	Target               []string `json:"target"`
	CustomEnvironmentIDs []string `json:"customEnvironmentIds"`
	GitBranch            string   `json:"gitBranch"`
}

func (a *Account) create(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	projectID := r.PathValue("project")
	p := a.project(projectID)

	var body envBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Key == nil || body.Value == nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "Invalid request: `key` and `value` are required.")
		return
	}
	if !keyPattern.MatchString(*body.Key) {
		writeErr(w, http.StatusBadRequest, invalidKeyCode, invalidKeyMessage)
		return
	}
	for _, e := range p.Envs {
		if e.Key == *body.Key && e.GitBranch == body.GitBranch &&
			(overlaps(e.Target, body.Target) || overlaps(e.CustomEnvironmentIDs, body.CustomEnvironmentIDs)) {
			writeErr(w, http.StatusBadRequest, "ENV_CONFLICT",
				fmt.Sprintf("A variable with the name `%s` already exists for the given target and branch.", *body.Key))
			return
		}
	}

	now := time.Now().UnixMilli()
	a.nextID++
	e := Env{
		ID:                   fmt.Sprintf("env_%d", a.nextID),
		Key:                  *body.Key,
		Value:                *body.Value,
		Type:                 body.Type,
		Target:               body.Target,
		CustomEnvironmentIDs: body.CustomEnvironmentIDs,
		GitBranch:            body.GitBranch,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	p.Envs = append(p.Envs, e)
	a.events.Publish(EnvCreated{EnvDetail{ProjectID: projectID, EnvID: e.ID, Key: e.Key}})
	writeJSON(w, http.StatusCreated, map[string]any{"created": envJSON(e, listedValue(e)), "failed": []any{}})
}

func (a *Account) update(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	e, projectID, ok := a.find(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "Environment Variable not found")
		return
	}

	var body envBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "bad_request", "Invalid request body.")
		return
	}
	if body.Key != nil {
		if !keyPattern.MatchString(*body.Key) {
			writeErr(w, http.StatusBadRequest, invalidKeyCode, invalidKeyMessage)
			return
		}
		e.Key = *body.Key
	}
	if body.Value != nil {
		e.Value = *body.Value
	}
	if body.Target != nil {
		e.Target = body.Target
	}
	if body.CustomEnvironmentIDs != nil {
		e.CustomEnvironmentIDs = body.CustomEnvironmentIDs
	}
	if body.GitBranch != "" {
		e.GitBranch = body.GitBranch
	}
	e.UpdatedAt = time.Now().UnixMilli()
	a.events.Publish(EnvUpdated{EnvDetail{ProjectID: projectID, EnvID: e.ID, Key: e.Key}})
	writeJSON(w, http.StatusOK, envJSON(*e, listedValue(*e)))
}

func (a *Account) remove(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	e, projectID, ok := a.find(r)
	if !ok {
		writeErr(w, http.StatusNotFound, "not_found", "Environment Variable not found")
		return
	}
	removed := *e
	p := a.project(projectID)
	p.Envs = slices.DeleteFunc(p.Envs, func(x Env) bool { return x.ID == removed.ID })
	a.events.Publish(EnvDeleted{EnvDetail{ProjectID: projectID, EnvID: removed.ID, Key: removed.Key}})
	writeJSON(w, http.StatusOK, envJSON(removed, listedValue(removed)))
}

// Snapshot marshals under the lock, so a concurrent request cannot mutate a project
// mid-encode.
func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Username string              `json:"username"`
		Projects map[string]*Project `json:"projects"`
	}{a.Username, a.Projects})
}

// Seed merges a partial account in, so a test names only what it cares about.
func (a *Account) Seed(raw []byte) error {
	var in Account
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if in.Username != "" {
		a.Username = in.Username
	}
	for projectID, p := range in.Projects {
		dst := a.project(projectID)
		for _, e := range p.Envs {
			if e.ID == "" {
				a.nextID++
				e.ID = fmt.Sprintf("env_%d", a.nextID)
			}
			if e.Type == "" {
				e.Type = "encrypted"
			}
			dst.Envs = append(dst.Envs, e)
		}
	}
	return nil
}

// project returns a project's variables, creating the project on first touch. The
// sync addresses a project by id, and the fake has no other way to learn it exists.
func (a *Account) project(id string) *Project {
	if p, ok := a.Projects[id]; ok {
		return p
	}
	p := &Project{Envs: []Env{}}
	a.Projects[id] = p
	return p
}

func (a *Account) find(r *http.Request) (*Env, string, bool) {
	projectID, id := r.PathValue("project"), r.PathValue("id")
	p := a.project(projectID)
	for i := range p.Envs {
		if p.Envs[i].ID == id {
			return &p.Envs[i], projectID, true
		}
	}
	return nil, projectID, false
}

// listedValue is what Vercel shows for a value outside a decrypting read.
func listedValue(e Env) string {
	switch e.Type {
	case "sensitive":
		return ""
	case "encrypted":
		return "encrypted:" + e.ID
	default:
		return e.Value
	}
}

func envJSON(e Env, value string) map[string]any {
	out := map[string]any{
		"id":                   e.ID,
		"key":                  e.Key,
		"value":                value,
		"type":                 e.Type,
		"target":               nonNil(e.Target),
		"customEnvironmentIds": nonNil(e.CustomEnvironmentIDs),
		"createdAt":            e.CreatedAt,
		"updatedAt":            e.UpdatedAt,
	}
	if e.GitBranch != "" {
		out["gitBranch"] = e.GitBranch
	}
	return out
}

func overlaps(a, b []string) bool {
	return slices.ContainsFunc(a, func(x string) bool { return slices.Contains(b, x) })
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeErr answers in Vercel's error shape, which the product reads the code and
// message from.
func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}
