package github

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"golang.org/x/crypto/nacl/box"
)

// Service answers for github.com. Use At for a self-hosted instance, which is worth
// registering separately: a sync pointed at the wrong instance then shows up as an
// empty store rather than passing.
var Service = service{host: "api.github.com"}

type service struct{ host string }

func (s service) At(host string) service { return service{host: host} }
func (s service) Host() string           { return s.host }

// Scope is the token. Two tenants syncing to the same repository at the same time are
// told apart by what they authenticate with.
func (service) Scope(r *http.Request) (string, bool) {
	return strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func (service) New() fakenet.Fake {
	a := &Account{Login: "harness", Stores: map[string]*Store{}}
	a.mux = a.routes()
	return a
}

func (a *Account) ServeHTTP(w http.ResponseWriter, r *http.Request) { a.mux.ServeHTTP(w, r) }

func (a *Account) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// Creating a GitHub app connection with the token method calls this to check the
	// credential works, so the fake answers it by existing rather than because a
	// test registered anything.
	mux.HandleFunc("GET /user", a.user)

	// One group per GitHubSyncScope. They differ only in the path they address, which
	// is why storeKey can fold all three into one address.
	a.secretRoutes(mux, "/orgs/{org}/actions/secrets")
	a.secretRoutes(mux, "/repos/{owner}/{repo}/actions/secrets")
	a.secretRoutes(mux, "/repos/{owner}/{repo}/environments/{env}/secrets")

	return mux
}

func (a *Account) secretRoutes(mux *http.ServeMux, path string) {
	mux.HandleFunc("GET "+path, a.list)
	mux.HandleFunc("GET "+path+"/public-key", a.publicKey)
	mux.HandleFunc("PUT "+path+"/{name}", a.put)
	mux.HandleFunc("DELETE "+path+"/{name}", a.remove)
}

func (a *Account) user(w http.ResponseWriter, _ *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{"login": a.Login, "id": 1, "type": "User"})
}

func (a *Account) publicKey(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	st := a.store(storeKey(r))
	writeJSON(w, http.StatusOK, map[string]any{
		"key_id": st.KeyID,
		"key":    base64.StdEncoding.EncodeToString(st.pub[:]),
	})
}

// list answers with a Link header when the result spans pages.
//
// Real pagination, because the client sets per_page=100, reads the Link header, parses
// rel="last" for a page count and then fetches the remaining pages concurrently
// (github-connection-fns.ts:433-500). Returning everything on one page would leave
// that loop untested.
func (a *Account) list(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	st := a.store(storeKey(r))

	names := make([]string, 0, len(st.Secrets))
	for n := range st.Secrets {
		names = append(names, n)
	}
	slices.Sort(names)

	perPage := intParam(r, "per_page", 30)
	page := intParam(r, "page", 1)
	last := (len(names) + perPage - 1) / perPage
	if last == 0 {
		last = 1
	}

	start := min((page-1)*perPage, len(names))
	end := min(start+perPage, len(names))
	if page < last {
		w.Header().Set("Link", linkHeader(r, page, last))
	}

	out := make([]map[string]any, 0, end-start)
	for _, n := range names[start:end] {
		out = append(out, map[string]any{
			"name":       n,
			"created_at": st.Secrets[n].UpdatedAt.Format(time.RFC3339),
			"updated_at": st.Secrets[n].UpdatedAt.Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"total_count": len(names), "secrets": out})
}

func (a *Account) put(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	st, name := a.store(storeKey(r)), r.PathValue("name")

	var body struct {
		EncryptedValue string `json:"encrypted_value"`
		KeyID          string `json:"key_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "Problems parsing JSON")
		return
	}
	if body.KeyID != st.KeyID {
		writeErr(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("key_id %q is not the public key for this scope", body.KeyID))
		return
	}

	// The check a stub cannot make. A sync that sent plaintext, sealed against the
	// wrong key, or mangled the base64 fails here rather than reading as a 204.
	sealed, err := base64.StdEncoding.DecodeString(body.EncryptedValue)
	if err != nil {
		writeErr(w, http.StatusUnprocessableEntity, "encrypted_value is not valid base64")
		return
	}
	plain, ok := box.OpenAnonymous(nil, sealed, st.pub, st.priv)
	if !ok {
		writeErr(w, http.StatusUnprocessableEntity, "encrypted_value is not a sealed box for this public key")
		return
	}

	_, existed := st.Secrets[name]
	st.Secrets[name] = Secret{Value: string(plain), UpdatedAt: time.Now().UTC()}
	if existed {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (a *Account) remove(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	st, name := a.store(storeKey(r)), r.PathValue("name")

	if _, ok := st.Secrets[name]; !ok {
		writeErr(w, http.StatusNotFound, "Not Found")
		return
	}
	delete(st.Secrets, name)
	w.WriteHeader(http.StatusNoContent)
}

// Snapshot marshals under the lock, so a concurrent request cannot mutate a map
// mid-encode.
func (a *Account) Snapshot() ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	return json.Marshal(struct {
		Login  string            `json:"login"`
		Stores map[string]*Store `json:"stores"`
	}{a.Login, a.Stores})
}

// Seed merges a partial account in, so a test names only what it cares about.
func (a *Account) Seed(raw []byte) error {
	var in Account
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	if in.Login != "" {
		a.Login = in.Login
	}
	for key, st := range in.Stores {
		dst := a.store(key)
		for name, s := range st.Secrets {
			at := s.UpdatedAt
			if at.IsZero() {
				at = time.Now().UTC()
			}
			dst.Secrets[name] = Secret{Value: s.Value, UpdatedAt: at}
		}
	}
	return nil
}

// store returns a scope's bag of secrets, creating it and its key pair on first
// touch. GitHub has no "create a repository's secret store" call; it is simply there.
func (a *Account) store(key string) *Store {
	if st, ok := a.Stores[key]; ok {
		return st
	}
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		panic(fmt.Sprintf("github fake: generating a key pair: %v", err))
	}
	st := &Store{
		KeyID:   "key-" + strings.ReplaceAll(key, "/", "-"),
		Secrets: map[string]Secret{},
		pub:     pub,
		priv:    priv,
	}
	a.Stores[key] = st
	return st
}

// storeKey folds whichever route matched into one address.
func storeKey(r *http.Request) string {
	if org := r.PathValue("org"); org != "" {
		return "orgs/" + org
	}
	key := "repos/" + r.PathValue("owner") + "/" + r.PathValue("repo")
	if env := r.PathValue("env"); env != "" {
		key += "/envs/" + env
	}
	return key
}

func linkHeader(r *http.Request, page, last int) string {
	u := *r.URL
	build := func(p int, rel string) string {
		q := u.Query()
		q.Set("page", strconv.Itoa(p))
		v := u
		v.RawQuery = q.Encode()
		return fmt.Sprintf(`<https://%s%s>; rel="%s"`, r.Host, v.RequestURI(), rel)
	}
	return build(page+1, "next") + ", " + build(last, "last")
}

func intParam(r *http.Request, name string, def int) int {
	if v, err := strconv.Atoi(r.URL.Query().Get(name)); err == nil && v > 0 {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}
