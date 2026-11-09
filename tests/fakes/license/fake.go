package license

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Host is where the License Server lives as far as the instance is concerned.
//
// A name nobody owns. fakenet answers DNS for every hostname, so this needs no
// registration anywhere; it just has to be a name the real product would never
// reach by accident.
const Host = "license.infisical.test"

// Service answers as the License Server.
var Service = service{}

type service struct{}

func (service) Host() string { return Host }

// Scope is the license key for a self-hosted instance, and the organization in the
// path for cloud.
//
// A self-hosted instance authenticates with its license key once, then with the token
// it was given, and its usage reports name the "self-hosted" organization, so the key
// is the only thing that tells two isolated stacks apart. Cloud entitlements are per
// organization, which is the whole reason the shared harness runs in Cloud mode. The
// instance-wide endpoints carry neither and share one scope.
func (service) Scope(r *http.Request) (string, bool) {
	if key := r.Header.Get("X-API-KEY"); key != "" {
		return key, true
	}
	if key := licenseKeyFromBearer(r.Header.Get("Authorization")); key != "" {
		return key, true
	}
	if org := orgFromPath(r.URL.Path); org != "" {
		return org, true
	}
	return "instance", true
}

// New returns a fully entitled organization.
//
// Entitled by default, and that is not a convenience. On any failure getPlan writes
// the OSS defaults into the plan cache for the full TTL rather than leaving it
// empty, so a single unanswered call poisons that organization for about fifteen
// minutes. With the default in the fake there is nothing to install and no window in
// which an organization can be asked about before the answer exists.
func (service) New(events fakenet.Emitter) fakenet.Fake {
	return &Org{state: State{Plan: Enterprise()}, events: events}
}

// State is what the License Server holds for one organization or license key.
type State struct {
	Plan

	// EntitlementFetches is every entitlements read, oldest first, with the query the
	// instance sent.
	EntitlementFetches []EntitlementFetch `json:"entitlementFetches"`

	// Snapshots is every usage snapshot received, oldest first.
	Snapshots []UsageSnapshot `json:"snapshots"`

	// UsageEvents is every metered usage event accepted, oldest first, without
	// duplicates of an event id.
	UsageEvents []UsageEvent `json:"usageEvents"`

	// Cancellations counts subscription cancellations.
	Cancellations int `json:"cancellations"`

	// Logins counts license key exchanges.
	Logins int `json:"logins"`
}

// EntitlementFetch is one entitlements read.
type EntitlementFetch struct {
	Region string `json:"region"`
}

// UsageSnapshot is one reported counter value, on the wire shape.
type UsageSnapshot struct {
	Dimension      string  `json:"dimension_key"`
	Value          float64 `json:"value"`
	ObservedAt     string  `json:"observed_at"`
	IdempotencyKey string  `json:"idempotency_key"`
	Source         string  `json:"source"`
}

// UsageEvent is one metered fact, on the wire shape.
type UsageEvent struct {
	EventID    string  `json:"event_id"`
	Dimension  string  `json:"dimension_key"`
	Quantity   float64 `json:"quantity"`
	OccurredAt string  `json:"occurred_at"`
	Source     string  `json:"source"`
}

// SnapshotReceived is published for every usage snapshot.
type SnapshotReceived struct{ UsageSnapshot }

func (SnapshotReceived) EventName() string { return "license.usage-snapshot-received" }

// UsageEventReceived is published for every new metered usage event.
type UsageEventReceived struct{ UsageEvent }

func (UsageEventReceived) EventName() string { return "license.usage-event-received" }

// SubscriptionCanceled is published when the instance cancels a subscription.
type SubscriptionCanceled struct{}

func (SubscriptionCanceled) EventName() string { return "license.subscription-canceled" }

// Org is one organization's, or one self-hosted license's, License Server state.
type Org struct {
	mu     sync.Mutex
	state  State
	events fakenet.Emitter
	mux    *http.ServeMux
}

func (o *Org) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	o.mu.Lock()
	if o.mux == nil {
		o.mux = o.routes()
	}
	mux := o.mux
	o.mu.Unlock()
	mux.ServeHTTP(w, r)
}

func (o *Org) routes() *http.ServeMux {
	mux := http.NewServeMux()

	entitlements := func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		o.mu.Lock()
		o.state.EntitlementFetches = append(o.state.EntitlementFetches, EntitlementFetch{Region: q.Get("region")})
		payload := o.state.Payload()
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, payload)
	}
	mux.HandleFunc("GET /v1/organizations/{orgId}/entitlements", entitlements)
	mux.HandleFunc("GET /v1/entitlements", entitlements)

	// Deleting an organization cancels its subscription, and the delete fails if
	// that call does. Every tenant registers its own removal on t.Cleanup, so
	// without this each test leaks its organization into the shared database for
	// the life of the run. The outcome is parsed rather than ignored, so an empty
	// body is not enough.
	mux.HandleFunc("POST /v1/organizations/{orgId}/subscription/cancel", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		o.state.Cancellations++
		o.mu.Unlock()
		o.events.Publish(SubscriptionCanceled{})
		writeJSON(w, http.StatusOK, map[string]any{"outcome": "subscription_canceled"})
	})

	mux.HandleFunc("POST /v1/organizations/{orgId}/usage-snapshots", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Snapshots []UsageSnapshot `json:"snapshots"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"message": "malformed usage snapshots"})
			return
		}
		o.mu.Lock()
		o.state.Snapshots = append(o.state.Snapshots, body.Snapshots...)
		o.mu.Unlock()
		for _, s := range body.Snapshots {
			o.events.Publish(SnapshotReceived{s})
		}
		writeJSON(w, http.StatusOK, map[string]any{"accepted": len(body.Snapshots)})
	})

	// The real server dedups on event_id, so a retry of an accepted batch is not
	// counted twice.
	mux.HandleFunc("POST /v1/organizations/{orgId}/usage-events", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Events []UsageEvent `json:"events"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"message": "malformed usage events"})
			return
		}
		type result struct {
			EventID string `json:"event_id"`
			Status  string `json:"status"`
		}
		results := make([]result, 0, len(body.Events))
		var accepted []UsageEvent
		o.mu.Lock()
		for _, e := range body.Events {
			if o.hasEvent(e.EventID) {
				results = append(results, result{EventID: e.EventID, Status: "deduped"})
				continue
			}
			o.state.UsageEvents = append(o.state.UsageEvents, e)
			accepted = append(accepted, e)
			results = append(results, result{EventID: e.EventID, Status: "accepted"})
		}
		o.mu.Unlock()
		for _, e := range accepted {
			o.events.Publish(UsageEventReceived{e})
		}
		writeJSON(w, http.StatusOK, map[string]any{"results": results})
	})

	// A self-hosted instance exchanges its license key for a short-lived token, and
	// sends that token on every later call. Scope has already resolved the key.
	mux.HandleFunc("POST /api/auth/v1/license-login", func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-API-KEY")
		o.mu.Lock()
		o.state.Logins++
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"token": issueToken(key, time.Now().Add(time.Hour))})
	})

	// The usage reporter authenticates against the same server. Nothing asserts on
	// these, but an unanswered call is a failed request path and noise in the logs.
	for _, p := range []string{"GET /v1/products", "GET /v1/subscription"} {
		mux.HandleFunc(p, func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]any{})
		})
	}

	return mux
}

func (o *Org) hasEvent(id string) bool {
	for _, e := range o.state.UsageEvents {
		if e.EventID == id {
			return true
		}
	}
	return false
}

func (o *Org) Snapshot() ([]byte, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	return json.Marshal(o.state)
}

// Seed replaces the plan outright and leaves what the server recorded alone.
// Entitlements are not additive: a downgrade is the case worth testing, and merging
// would make it unexpressible.
func (o *Org) Seed(raw []byte) error {
	var p Plan
	if err := json.Unmarshal(raw, &p); err != nil {
		return err
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	o.state.Plan = p
	return nil
}

// issueToken returns an unsigned JWT naming the license key. The instance reads only
// its exp; the fake reads the key back to find the license's scope.
func issueToken(key string, exp time.Time) string {
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{"lic": key, "exp": exp.Unix()})
	return header + "." + enc.EncodeToString(payload) + ".fake"
}

// licenseKeyFromBearer reads the license key out of a token issueToken minted. A
// cloud service token carries no such claim and resolves by path instead.
func licenseKeyFromBearer(authorization string) string {
	token, ok := strings.CutPrefix(authorization, "Bearer ")
	if !ok {
		return ""
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return ""
	}
	var claims struct {
		Lic string `json:"lic"`
	}
	if json.Unmarshal(raw, &claims) != nil {
		return ""
	}
	return claims.Lic
}

// orgFromPath pulls the id out of /v1/organizations/{id}/...
func orgFromPath(path string) string {
	const prefix = "/v1/organizations/"
	if len(path) <= len(prefix) || path[:len(prefix)] != prefix {
		return ""
	}
	rest := path[len(prefix):]
	for i := range len(rest) {
		if rest[i] == '/' {
			return rest[:i]
		}
	}
	return rest
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		_, _ = fmt.Fprint(w, "{}")
	}
}
