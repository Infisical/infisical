package webhook

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Sink is one hostname that accepts deliveries.
type Sink struct {
	host string

	// prefix comes before the nonce in the path. Slack's incoming webhooks live
	// under /services/.
	prefix string
	slack  bool
}

// Service is a generic receiver on a hostname of its own. Infisical takes any URL for
// a general webhook, so the name only has to resolve, which every name does here.
var Service = Sink{host: "hooks.webhook.test", prefix: "/"}

// Slack answers as hooks.slack.com, the only host Infisical accepts for a Slack
// webhook.
var Slack = Sink{host: "hooks.slack.com", prefix: "/services/", slack: true}

func (s Sink) Host() string { return s.host }

// URL is the address a test hands Infisical. The nonce in the path is what keeps
// parallel tenants' deliveries apart, since a webhook carries no credential.
func (s Sink) URL(nonce string) string { return "https://" + s.host + s.prefix + nonce }

// Scope is the first path segment after the prefix.
func (s Sink) Scope(r *http.Request) (string, bool) {
	rest, ok := strings.CutPrefix(r.URL.Path, s.prefix)
	if !ok {
		return "", false
	}
	nonce, _, _ := strings.Cut(rest, "/")
	return nonce, nonce != ""
}

func (s Sink) New(events fakenet.Emitter) fakenet.Fake {
	e := &Endpoint{Deliveries: []Delivery{}, sink: s, events: events}
	e.mux = e.routes()
	return e
}

func (e *Endpoint) ServeHTTP(w http.ResponseWriter, r *http.Request) { e.mux.ServeHTTP(w, r) }

func (e *Endpoint) routes() *http.ServeMux {
	mux := http.NewServeMux()
	if e.sink.slack {
		// Slack's incoming webhooks take a POST and nothing else.
		mux.HandleFunc("POST /services/{nonce}", e.receive)
		mux.HandleFunc("POST /services/{nonce}/{rest...}", e.receive)
		return mux
	}
	// A generic receiver records whatever arrives, so a delivery sent with the wrong
	// method shows up in the event rather than as a 405 nobody reads.
	mux.HandleFunc("/{nonce}", e.receive)
	mux.HandleFunc("/{nonce}/{rest...}", e.receive)
	return mux
}

func (e *Endpoint) receive(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "reading the body: "+err.Error(), http.StatusBadRequest)
		return
	}

	e.mu.Lock()
	status, answer := e.answer(body)
	d := Delivery{
		Method:     r.Method,
		Path:       r.URL.Path,
		Header:     r.Header.Clone(),
		Body:       string(body),
		Status:     status,
		ReceivedAt: time.Now().UTC(),
	}
	e.Deliveries = append(e.Deliveries, d)
	e.mu.Unlock()

	e.events.Publish(DeliveryReceived{d})

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(answer))
}

// answer is what the endpoint replies. Called with the lock held.
//
// Slack refuses a body it cannot render with a 400 and a short code, which is how a
// payload missing its text fails in production; modelling it is what lets a test
// about the Slack format fail on a malformed card instead of passing.
func (e *Endpoint) answer(body []byte) (int, string) {
	if e.Respond != 0 && e.Respond != http.StatusOK {
		return e.Respond, http.StatusText(e.Respond)
	}
	if !e.sink.slack {
		return http.StatusOK, ""
	}
	var msg struct {
		Text   string          `json:"text"`
		Blocks json.RawMessage `json:"blocks"`
	}
	if json.Unmarshal(body, &msg) != nil {
		return http.StatusBadRequest, "invalid_payload"
	}
	if msg.Text == "" && len(msg.Blocks) == 0 {
		return http.StatusBadRequest, "no_text"
	}
	return http.StatusOK, "ok"
}

// Snapshot marshals under the lock, so a delivery arriving mid-encode cannot race it.
func (e *Endpoint) Snapshot() ([]byte, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return json.Marshal(struct {
		Respond    int        `json:"respond,omitempty"`
		Deliveries []Delivery `json:"deliveries"`
	}{e.Respond, e.Deliveries})
}

// Seed sets the response status. Deliveries are not seedable: they are only ever
// what Infisical sent.
func (e *Endpoint) Seed(raw []byte) error {
	var in struct {
		Respond int `json:"respond"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if in.Respond != 0 {
		e.Respond = in.Respond
	}
	return nil
}
