// Package gcp fakes the parts of Google Cloud that Infisical calls for workload identity
// federation: the Security Token Service, which exchanges an external OIDC token for a
// federated access token, and the IAM Credentials API, which trades that for a service
// account's access token.
//
// One fake for the provider, served on each hostname the client calls. Each host is its
// own fakenet scope, both keyed by the workload identity pool a test invents: STS reads
// the pool from the request's audience, and IAM Credentials from the federated token
// STS issued, which a process-wide registry maps back to the pool and the identity it
// was issued for. That registry is what GCP shares between the two services.
//
// STS checks a token the way Google does: it fetches the issuer's OIDC discovery
// document and JWKS when the token arrives and verifies the RS256 signature against
// them, then the issuer, audience and lifetime. It accepts any valid token from the
// trusted issuer; who may act as a service account is decided by IAM Credentials,
// against the service account's roles/iam.workloadIdentityUser members.
package gcp

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

var (
	STS            = service{host: "sts.googleapis.com", scope: stsScope, newFake: newPool}
	IAMCredentials = service{host: "iamcredentials.googleapis.com", scope: iamScope, newFake: newServiceAccounts}
)

// Services is every Google Cloud host fakenet answers for.
var Services = []fakenet.Service{STS, IAMCredentials}

type service struct {
	host    string
	scope   func(*http.Request) (string, bool)
	newFake func(fakenet.Emitter) fakenet.Fake
}

func (s service) Host() string                            { return s.host }
func (s service) Scope(r *http.Request) (string, bool)    { return s.scope(r) }
func (s service) New(events fakenet.Emitter) fakenet.Fake { return s.newFake(events) }

// stsScope is the pool named in the exchange's audience. The body is read and put back,
// because the token request carries the pool nowhere else.
func stsScope(r *http.Request) (string, bool) {
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		return "", false
	}
	r.Body = io.NopCloser(bytes.NewReader(raw))
	var in struct {
		Audience string `json:"audience"`
	}
	if json.Unmarshal(raw, &in) != nil {
		return "", false
	}
	name, ok := parseProviderAudience(in.Audience)
	if !ok {
		return "", false
	}
	return name.Pool, true
}

// iamScope is the pool that issued the bearer token. A token STS never issued has no
// pool, so it gets a scope of its own and is refused as unauthenticated there.
func iamScope(r *http.Request) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || token == "" {
		return "", false
	}
	if id, found := lookupFederated(token); found {
		return id.Pool, true
	}
	return token, true
}

// ProjectNumber is the Google Cloud project a pool lives in. Derived from the pool id
// rather than registered, so a test names only the pool and a provider resource name
// in another project is refused the way GCP refuses one that does not exist.
func ProjectNumber(poolID string) string {
	sum := sha256.Sum256([]byte("infisical-fake-gcp-project/" + poolID))
	out := make([]byte, 12)
	out[0] = '1' + sum[0]%9
	for i := 1; i < len(out); i++ {
		out[i] = '0' + sum[i]%10
	}
	return string(out)
}

// ProviderName is a workload identity pool provider's full resource name.
type ProviderName struct {
	ProjectNumber string
	Pool          string
	Provider      string
}

func (n ProviderName) String() string {
	return "projects/" + n.ProjectNumber + "/locations/global/workloadIdentityPools/" + n.Pool + "/providers/" + n.Provider
}

// parseProviderAudience reads the STS audience, //iam.googleapis.com/<provider name>.
func parseProviderAudience(audience string) (ProviderName, bool) {
	rest, ok := strings.CutPrefix(audience, "//iam.googleapis.com/")
	if !ok {
		return ProviderName{}, false
	}
	parts := strings.Split(rest, "/")
	if len(parts) != 8 || parts[0] != "projects" || parts[2] != "locations" || parts[3] != "global" ||
		parts[4] != "workloadIdentityPools" || parts[6] != "providers" {
		return ProviderName{}, false
	}
	if parts[1] == "" || parts[5] == "" || parts[7] == "" {
		return ProviderName{}, false
	}
	return ProviderName{ProjectNumber: parts[1], Pool: parts[5], Provider: parts[7]}, true
}

// identity is who a federated token was issued to: a subject in a pool, with the
// attributes the provider mapped from the token.
type identity struct {
	ProjectNumber string
	Pool          string
	Subject       string
	Attributes    map[string]string
	ExpiresAt     time.Time
}

func (id identity) poolPrefix() string {
	return "iam.googleapis.com/projects/" + id.ProjectNumber + "/locations/global/workloadIdentityPools/" + id.Pool
}

// members is every IAM member string that names this identity.
func (id identity) members() []string {
	out := []string{
		"principal://" + id.poolPrefix() + "/subject/" + id.Subject,
		"principalSet://" + id.poolPrefix() + "/*",
	}
	for k, v := range id.Attributes {
		out = append(out, "principalSet://"+id.poolPrefix()+"/attribute."+k+"/"+v)
	}
	return out
}

// federated is the registry of tokens STS issued, which IAM Credentials accepts as
// bearer tokens. Process-wide because fakenet builds one fake per host and scope, and
// the two hosts have to agree on which tokens exist.
var federated = struct {
	mu     sync.Mutex
	tokens map[string]identity
}{tokens: map[string]identity{}}

func issueFederated(id identity) string {
	token := "ya29.d." + randomHex(32)
	federated.mu.Lock()
	defer federated.mu.Unlock()
	now := time.Now()
	for t, held := range federated.tokens {
		if now.After(held.ExpiresAt) {
			delete(federated.tokens, t)
		}
	}
	federated.tokens[token] = id
	return token
}

func lookupFederated(token string) (identity, bool) {
	federated.mu.Lock()
	defer federated.mu.Unlock()
	id, ok := federated.tokens[token]
	return id, ok
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
