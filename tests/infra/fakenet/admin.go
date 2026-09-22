package fakenet

import (
	"encoding/json"
	"io"
	"net/http"
)

// AdminPrefix is the control surface, served on its own port so the application can
// never reach it. It is generic: the engine moves bytes and never interprets a
// fake's state or seed document.
const AdminPrefix = "/__fake"

// Admin returns the control API.
func (s *Server) Admin(ca *CA) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET "+AdminPrefix+"/health", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	// What to print when a test failed for want of a fake. The application reports a
	// validation failure and rarely names the URL, so without this the author is left
	// guessing which call they missed.
	mux.HandleFunc("GET "+AdminPrefix+"/denied", func(w http.ResponseWriter, _ *http.Request) {
		s.mu.Lock()
		out := append([]Denied(nil), s.denied...)
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	})

	mux.HandleFunc("GET "+AdminPrefix+"/ca", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/x-pem-file")
		_, _ = w.Write(ca.CertPEM())
	})

	mux.HandleFunc("GET "+AdminPrefix+"/scopes/{host}/{key}/state", func(w http.ResponseWriter, r *http.Request) {
		sc, err := s.adminScope(r)
		if err != nil {
			adminErr(w, err)
			return
		}
		body, mErr := sc.fake.Snapshot()
		if mErr != nil {
			http.Error(w, mErr.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	})

	mux.HandleFunc("POST "+AdminPrefix+"/scopes/{host}/{key}/seed", func(w http.ResponseWriter, r *http.Request) {
		sc, err := s.adminScope(r)
		if err != nil {
			adminErr(w, err)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		if sErr := sc.fake.Seed(raw); sErr != nil {
			http.Error(w, sErr.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST "+AdminPrefix+"/scopes/{host}/{key}/rules", func(w http.ResponseWriter, r *http.Request) {
		sc, err := s.adminScope(r)
		if err != nil {
			adminErr(w, err)
			return
		}
		var rule Rule
		if dErr := json.NewDecoder(r.Body).Decode(&rule); dErr != nil {
			http.Error(w, dErr.Error(), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		sc.rules = append(sc.rules, &rule)
		s.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET "+AdminPrefix+"/scopes/{host}/{key}/calls", func(w http.ResponseWriter, r *http.Request) {
		sc, err := s.adminScope(r)
		if err != nil {
			adminErr(w, err)
			return
		}
		s.mu.Lock()
		calls := append([]Call(nil), sc.calls...)
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(calls)
	})

	mux.HandleFunc("DELETE "+AdminPrefix+"/scopes/{host}/{key}", func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		delete(s.scopes, scopeID{r.PathValue("host"), r.PathValue("key")})
		s.mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	})

	return mux
}

// adminScope resolves a scope, creating it if the test is seeding before the product
// has made its first call.
func (s *Server) adminScope(r *http.Request) (*scope, error) {
	host, key := r.PathValue("host"), r.PathValue("key")
	s.mu.Lock()
	svc, ok := s.services[host]
	s.mu.Unlock()
	if !ok {
		return nil, errUnknownHost(host)
	}
	return s.scope(host, svc, key), nil
}

type errUnknownHost string

func (e errUnknownHost) Error() string {
	return "fakenet: no fake registered for host " + string(e) +
		"\nAdd its Service to fakenet.New in cmd/fakenet."
}

func adminErr(w http.ResponseWriter, err error) {
	http.Error(w, err.Error(), http.StatusNotFound)
}
