// Package webhook fakes the receiving end of an outgoing webhook: an HTTPS endpoint
// that accepts deliveries and keeps what it was sent.
//
// One fake for every receiver, Slack included. A Slack incoming webhook is the same
// thing at a fixed host with one extra rule about the body, so splitting it out would
// mean two receivers free to disagree about what a delivery is.
package webhook

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Endpoint is one receiving URL, addressed by the nonce in its path.
type Endpoint struct {
	// Respond is the status the endpoint answers every delivery with. Zero means a
	// success. Unlike fakenet's Fail, the delivery is still kept and published, so a
	// test can wait on a failed delivery and then on the absence of a retry.
	Respond int `json:"respond,omitempty"`

	Deliveries []Delivery `json:"deliveries"`

	mu     sync.Mutex
	mux    *http.ServeMux
	sink   Sink
	events fakenet.Emitter
}

// Delivery is one request the endpoint received, with the status it answered.
//
// Body is the raw text rather than decoded JSON: a signature is computed over the
// exact bytes, and re-encoding would change them.
type Delivery struct {
	Method     string      `json:"method"`
	Path       string      `json:"path"`
	Header     http.Header `json:"header"`
	Body       string      `json:"body"`
	Status     int         `json:"status"`
	ReceivedAt time.Time   `json:"receivedAt"`
}

// Decode reads the body as JSON into v.
func (d Delivery) Decode(v any) error { return json.Unmarshal([]byte(d.Body), v) }

// Respond is a seed fragment that sets the status every later delivery is answered
// with.
func Respond(status int) any { return Endpoint{Respond: status} }
