package license

import (
	"encoding/base64"
	"encoding/json"
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

// Scope is the license key on self-hosted and the org in the path on cloud. Self-hosted
// usage reports all say "self-hosted", so only the key tells two isolated stacks apart.
// Instance-wide endpoints carry neither and share one scope.
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
// Entitled by default on purpose: when the License Server call fails, getPlan caches
// the OSS defaults for the full TTL, so one unanswered call poisons that org for about
// fifteen minutes. A default leaves no window where an org is asked about too early.
func (service) New(events fakenet.Emitter) fakenet.Fake {
	return &Org{state: State{Plan: Enterprise()}, events: events}
}

type State struct {
	Plan

	// Oldest first, with the query the instance sent.
	EntitlementFetches []EntitlementFetch `json:"entitlementFetches"`

	// Oldest first.
	Snapshots []UsageSnapshot `json:"snapshots"`

	// Oldest first, deduped by event id.
	UsageEvents []UsageEvent `json:"usageEvents"`

	// License key exchanges.
	Logins int `json:"logins"`
}

type EntitlementFetch struct {
	OrgName string `json:"orgName"`
	OrgSlug string `json:"orgSlug"`
}

type UsageSnapshot struct {
	Dimension      string  `json:"dimension_key"`
	Value          float64 `json:"value"`
	ObservedAt     string  `json:"observed_at"`
	IdempotencyKey string  `json:"idempotency_key"`
	Source         string  `json:"source"`
}

type UsageEvent struct {
	EventID    string  `json:"event_id"`
	Dimension  string  `json:"dimension_key"`
	Quantity   float64 `json:"quantity"`
	OccurredAt string  `json:"occurred_at"`
	Source     string  `json:"source"`
}

type SnapshotReceived struct{ UsageSnapshot }

func (SnapshotReceived) EventName() string { return "license.usage-snapshot-received" }

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
		o.state.EntitlementFetches = append(o.state.EntitlementFetches, EntitlementFetch{OrgName: q.Get("org_name"), OrgSlug: q.Get("org_slug")})
		payload := o.state.Payload()
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, payload)
	}
	mux.HandleFunc("GET /v1/organizations/{orgId}/entitlements", entitlements)
	mux.HandleFunc("GET /v1/entitlements", entitlements)

	// Without this, every deleted tenant keeps retrying through the outbox all run.
	mux.HandleFunc("DELETE /v1/organizations/{orgId}", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"licensesClosed": 1, "canceledSubscriptionIds": []string{}, "commitmentForfeited": false})
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

	// The real server dedups on event_id, so a retried batch isn't counted twice.
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
		o.mu.Lock()
		for _, e := range body.Events {
			if o.hasEvent(e.EventID) {
				results = append(results, result{EventID: e.EventID, Status: "deduped"})
				continue
			}
			o.state.UsageEvents = append(o.state.UsageEvents, e)
			results = append(results, result{EventID: e.EventID, Status: "accepted"})
		}
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"results": results})
	})

	// Self-hosted trades its license key for a short-lived token it sends on later calls.
	mux.HandleFunc("POST /api/auth/v1/license-login", func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-API-KEY")
		o.mu.Lock()
		o.state.Logins++
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"token": issueToken(key, time.Now().Add(time.Hour))})
	})

	// Nothing asserts on these, but unanswered they'd fail requests and spam the logs.
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

// Seed replaces the plan instead of merging, otherwise you couldn't test a downgrade.
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

// Unsigned on purpose: the instance only reads exp, and the fake reads the key back
// out to find the scope.
func issueToken(key string, exp time.Time) string {
	enc := base64.RawURLEncoding
	header := enc.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload, _ := json.Marshal(map[string]any{"lic": key, "exp": exp.Unix()})
	return header + "." + enc.EncodeToString(payload) + ".fake"
}

// Cloud service tokens don't carry the key; those resolve by path.
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
	_ = json.NewEncoder(w).Encode(body)
}
