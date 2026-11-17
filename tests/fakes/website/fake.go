package website

import (
	"net/http"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Domain is the parent of every name this fake serves.
const Domain = "web.test"

type service struct{}

// Service answers for every name under web.test.
var Service = service{}

func (service) Host() string { return "*." + Domain }

// Scope is the label just left of web.test, so a.<scope>.web.test and
// <scope>.web.test are one site.
func (service) Scope(r *http.Request) (string, bool) {
	host := r.Host
	if i := strings.IndexByte(host, ':'); i >= 0 {
		host = host[:i]
	}
	rest, ok := strings.CutSuffix(host, "."+Domain)
	if !ok {
		return "", false
	}
	labels := strings.Split(rest, ".")
	scope := labels[len(labels)-1]
	return scope, scope != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	s := &Site{Challenges: map[string]string{}, Fetches: []Fetch{}, events: events}
	s.mux = http.NewServeMux()
	s.mux.HandleFunc("GET /.well-known/acme-challenge/{token}", s.serveChallenge)
	return s
}

// Name is a hostname under a scope's site.
func Name(scope, label string) string { return label + "." + scope + "." + Domain }

func (s *Site) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func (s *Site) serveChallenge(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")

	s.mu.Lock()
	keyAuth, ok := s.Challenges[token]
	status := http.StatusOK
	if !ok {
		status = http.StatusNotFound
	}
	f := Fetch{Host: r.Host, Token: token, Status: status, FetchedAt: time.Now().UTC()}
	s.Fetches = append(s.Fetches, f)
	s.mu.Unlock()

	s.events.Publish(ChallengeServed{f})

	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/plain")
	_, _ = w.Write([]byte(keyAuth))
}
