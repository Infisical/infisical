// Package kubernetes fakes the one part of a Kubernetes API server Infisical calls for
// machine identity Kubernetes auth: TokenReview, plus /version when the auth method is
// attached.
//
// The API server address is configurable per identity, so the fake answers on a name of
// its own. The scope is the token reviewer JWT Infisical presents, which a test invents
// per identity. What TokenReview says about a service account token is seeded by the
// test: the fake plays the cluster, the test plays the workload holding the token.
package kubernetes

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

var Service = service{host: "api.kubernetes.test"}

type service struct{ host string }

func (s service) Host() string { return s.host }

// URL is what an identity's kubernetesHost is set to.
func (s service) URL() string { return "https://" + s.host }

// Scope is the reviewer JWT. Attaching Kubernetes auth probes /version with no
// credential first, which a real API server answers anonymously; it holds no state, so
// those probes share one scope.
func (service) Scope(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if (!ok || token == "") && r.URL.Path == "/version" {
		return "anonymous-version", true
	}
	return token, ok && token != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	c := &Cluster{Reviews: map[string]Review{}, events: events}
	c.mux = c.routes()
	return c
}

// Cluster is the API server as one reviewer sees it.
type Cluster struct {
	// Reviews says what TokenReview answers for a service account token. A token with no
	// entry is reported as not authenticated.
	Reviews map[string]Review `json:"reviews"`

	// RejectReviewer makes the API server refuse the reviewer's own credential, as a
	// cluster does when the reviewer lacks the system:auth-delegator role.
	RejectReviewer bool `json:"rejectReviewer"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// Review is TokenReview's verdict on one token.
type Review struct {
	Authenticated bool     `json:"authenticated"`
	Username      string   `json:"username,omitempty"`
	Audiences     []string `json:"audiences,omitempty"`
	Error         string   `json:"error,omitempty"`
}

// ServiceAccount is the username Kubernetes gives a service account token.
func ServiceAccount(namespace, name string) string {
	return "system:serviceaccount:" + namespace + ":" + name
}

// TokenReviewed is published for every review, with the token it was asked about.
type TokenReviewed struct {
	Token     string   `json:"token"`
	Audiences []string `json:"audiences,omitempty"`
}

func (TokenReviewed) EventName() string { return "kubernetes.token-reviewed" }

func (c *Cluster) ServeHTTP(w http.ResponseWriter, r *http.Request) { c.mux.ServeHTTP(w, r) }

func (c *Cluster) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /version", c.version)
	mux.HandleFunc("POST /apis/authentication.k8s.io/v1/tokenreviews", c.review)
	return mux
}

func (c *Cluster) version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"major": "1", "minor": "30", "gitVersion": "v1.30.0", "platform": "linux/amd64"})
}

func (c *Cluster) review(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Spec struct {
			Token     string   `json:"token"`
			Audiences []string `json:"audiences"`
		} `json:"spec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeStatus(w, http.StatusBadRequest, "BadRequest", "decoding the TokenReview: "+err.Error())
		return
	}

	c.mu.Lock()
	reject := c.RejectReviewer
	verdict, known := c.Reviews[in.Spec.Token]
	c.mu.Unlock()

	if reject {
		writeStatus(w, http.StatusForbidden, "Forbidden",
			`tokenreviews.authentication.k8s.io is forbidden: User "system:serviceaccount:infisical:reviewer" cannot create resource "tokenreviews" in API group "authentication.k8s.io" at the cluster scope`)
		return
	}
	c.events.Publish(TokenReviewed{Token: in.Spec.Token, Audiences: in.Spec.Audiences})

	status := map[string]any{"authenticated": false}
	if known {
		status["authenticated"] = verdict.Authenticated
		if verdict.Error != "" {
			status["error"] = verdict.Error
		}
		if verdict.Authenticated {
			status["user"] = map[string]any{"username": verdict.Username, "uid": "uid-" + verdict.Username}
			audiences := verdict.Audiences
			if len(in.Spec.Audiences) > 0 && audiences == nil {
				audiences = in.Spec.Audiences
			}
			status["audiences"] = audiences
		}
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"apiVersion": "authentication.k8s.io/v1",
		"kind":       "TokenReview",
		"spec":       map[string]any{"token": in.Spec.Token, "audiences": in.Spec.Audiences},
		"status":     status,
	})
}

func (c *Cluster) Snapshot() ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return json.Marshal(struct {
		Reviews        map[string]Review `json:"reviews"`
		RejectReviewer bool              `json:"rejectReviewer"`
	}{c.Reviews, c.RejectReviewer})
}

func (c *Cluster) Seed(raw []byte) error {
	var in struct {
		Reviews        map[string]Review `json:"reviews"`
		RejectReviewer *bool             `json:"rejectReviewer"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, v := range in.Reviews {
		c.Reviews[k] = v
	}
	if in.RejectReviewer != nil {
		c.RejectReviewer = *in.RejectReviewer
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeStatus(w http.ResponseWriter, code int, reason, message string) {
	writeJSON(w, code, map[string]any{
		"kind": "Status", "apiVersion": "v1", "status": "Failure",
		"message": message, "reason": reason, "code": code,
	})
}
