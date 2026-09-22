// Package fakenet is the harness's fake internet: one server holding a working
// implementation of every third party Infisical calls out to.
//
// Fakes, not stubs. A fake holds real state and mutates as the product drives it, so
// a test asserts on what the destination ended up holding rather than on which
// requests were sent. That difference is the whole reason this exists: a secret sync
// computes what to delete from what the destination returns, so stubbing that list
// means asserting against a fixture we invented.
//
// Interception is DNS rather than proxy. Every hostname resolves here, so no client
// has to honour HTTP_PROXY, which the AWS, GCP and Azure SDKs never did.
package fakenet

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Service is one third-party API.
type Service interface {
	// Host is the name the product's client has hardcoded. It has to be hardcoded
	// for a test to mean anything: a configurable base URL pointed straight at
	// fakenet would prove the fake works and nothing about interception.
	Host() string

	// Scope says which caller a request belongs to, by reading the credential off
	// it. Two parallel tenants call the same path and are told apart by what they
	// authenticate with, so no organization id is threaded anywhere.
	Scope(*http.Request) (key string, ok bool)

	// New builds an empty world for one scope.
	New() Fake
}

// Fake is one scope's state.
//
// Snapshot marshals rather than returning a value, so a fake serialises under its own
// lock. Returning the struct and marshalling it later would race with a request
// mutating it.
type Fake interface {
	http.Handler
	Snapshot() ([]byte, error)
	Seed([]byte) error
}

// Call is one request a scope received.
type Call struct {
	Method string    `json:"method"`
	Path   string    `json:"path"`
	Status int       `json:"status"`
	At     time.Time `json:"at"`
}

// Rule overrides a fake for a matching request. This is failure injection: no real
// API has "fail the next call with a 500", so it cannot be a fake's own behaviour.
type Rule struct {
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Body   string `json:"body"`

	// Times is how many matching requests it applies to. Zero means every one.
	Times int `json:"times"`
}

type scopeID struct{ host, key string }

type scope struct {
	fake  Fake
	rules []*Rule
	calls []Call
}

// Server holds every fake and dispatches to them.
type Server struct {
	mu       sync.Mutex
	services map[string]Service
	scopes   map[scopeID]*scope

	// denied is every call that reached no fake. Kept globally rather than per
	// scope because a refusal happens before a scope can be resolved, and it is
	// exactly what a test needs printed when a create failed for want of a fake.
	denied []Denied
}

// Denied is one outbound call that reached no fake.
type Denied struct {
	Method string    `json:"method"`
	URL    string    `json:"url"`
	Reason string    `json:"reason"`
	At     time.Time `json:"at"`
}

func New(services ...Service) *Server {
	s := &Server{services: map[string]Service{}, scopes: map[scopeID]*scope{}}
	for _, svc := range services {
		s.services[svc.Host()] = svc
	}
	return s
}

// Hosts is every hostname fakenet answers for.
func (s *Server) Hosts() []string {
	out := make([]string, 0, len(s.services))
	for h := range s.services {
		out = append(out, h)
	}
	return out
}

// ServeHTTP is the fake-serving handler, reached over TLS on 443.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := hostOf(r)

	s.mu.Lock()
	svc, known := s.services[host]
	s.mu.Unlock()

	// Every hostname resolves here, so an unfaked one arrives as a normal request
	// rather than failing to connect. Answering it with a 501 naming the URL is what
	// replaces WireMock's deny-all: a forgotten fake has to fail loudly, or a test
	// passes without exercising anything.
	if !known {
		s.refuse(w, r, host, "no fake is registered for this host")
		return
	}

	key, ok := svc.Scope(r)
	if !ok || key == "" {
		s.refuse(w, r, host, "the request carried no credential, so it cannot be attributed to a test")
		return
	}

	sc := s.scope(host, svc, key)

	rec := &recorder{ResponseWriter: w, status: http.StatusOK}
	if rule := s.takeRule(sc, r); rule != nil {
		rec.WriteHeader(rule.Status)
		if rule.Body != "" {
			_, _ = rec.Write([]byte(rule.Body))
		}
	} else {
		sc.fake.ServeHTTP(rec, r)
	}

	s.mu.Lock()
	sc.calls = append(sc.calls, Call{Method: r.Method, Path: r.URL.Path, Status: rec.status, At: time.Now().UTC()})
	s.mu.Unlock()

	// One line per outbound call, always. Container logs are captured to a file
	// anyway, and this is the first thing worth reading when a sync did not do what
	// a test expected: it says whether the call happened at all, and under which
	// credential.
	log.Printf("%-6s %s%s -> %d  scope=%s", r.Method, host, r.URL.Path, rec.status, short(key))
}

func short(key string) string {
	if len(key) > 12 {
		return key[:12] + "..."
	}
	return key
}

// scope returns a scope, creating it the first time a credential is seen.
//
// On demand rather than registered, which is why creating an app connection works
// with no test setup: Infisical validates the credential, fakenet meets it for the
// first time, and answers.
func (s *Server) scope(host string, svc Service, key string) *scope {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := scopeID{host, key}
	sc, ok := s.scopes[id]
	if !ok {
		sc = &scope{fake: svc.New()}
		s.scopes[id] = sc
	}
	return sc
}

func (s *Server) takeRule(sc *scope, r *http.Request) *Rule {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, rule := range sc.rules {
		if !matches(rule, r) {
			continue
		}
		if rule.Times > 0 {
			rule.Times--
			if rule.Times == 0 {
				sc.rules = append(sc.rules[:i], sc.rules[i+1:]...)
			}
		}
		return rule
	}
	return nil
}

func matches(rule *Rule, r *http.Request) bool {
	if rule.Method != "" && !strings.EqualFold(rule.Method, r.Method) {
		return false
	}
	switch {
	case rule.Path == "" || rule.Path == "*":
		return true
	case strings.HasSuffix(rule.Path, "*"):
		return strings.HasPrefix(r.URL.Path, strings.TrimSuffix(rule.Path, "*"))
	default:
		return rule.Path == r.URL.Path
	}
}

// hostOf strips the port, which is present on a proxied request and absent on a
// direct one.
func hostOf(r *http.Request) string {
	h := r.Host
	if i := strings.IndexByte(h, ':'); i >= 0 {
		h = h[:i]
	}
	return h
}

// refuse answers a call nothing can serve, and records it.
//
// 501 rather than a dropped connection, because a refused connection reads to the
// application as a network blip and is often retried.
func (s *Server) refuse(w http.ResponseWriter, r *http.Request, host, reason string) {
	url := "https://" + host + r.URL.Path
	msg := "fakenet has no fake for " + r.Method + " " + url + ": " + reason

	s.mu.Lock()
	s.denied = append(s.denied, Denied{Method: r.Method, URL: url, Reason: reason, At: time.Now().UTC()})
	s.mu.Unlock()

	log.Printf("%-6s %s%s -> 501  %s", r.Method, host, r.URL.Path, reason)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	_ = json.NewEncoder(w).Encode(map[string]string{"message": msg})
}

// recorder captures the status for the call log without buffering the body.
type recorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (rec *recorder) WriteHeader(code int) {
	if rec.written {
		return
	}
	rec.status = code
	rec.written = true
	rec.ResponseWriter.WriteHeader(code)
}

func (rec *recorder) Write(b []byte) (int, error) {
	if !rec.written {
		rec.written = true
	}
	return rec.ResponseWriter.Write(b)
}
