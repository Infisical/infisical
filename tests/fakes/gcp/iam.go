package gcp

import (
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// maxAccessTokenLifetime is generateAccessToken's limit without the org policy that
// extends it.
const maxAccessTokenLifetime = time.Hour

// ServiceAccounts are the service accounts a pool's identities may be granted, by
// email, and every access token IAM Credentials issued for them.
type ServiceAccounts struct {
	Accounts map[string]*ServiceAccount `json:"accounts"`
	Issued   []AccessToken              `json:"issued"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// ServiceAccount holds the members granted roles/iam.workloadIdentityUser on it:
// principal://... for one subject, principalSet://... for a set of them.
type ServiceAccount struct {
	WorkloadIdentityUsers []string `json:"workloadIdentityUsers"`
}

// AccessToken is one service account access token issued for a federated identity.
type AccessToken struct {
	ServiceAccount string            `json:"serviceAccount"`
	Subject        string            `json:"subject"`
	Attributes     map[string]string `json:"attributes"`
	Scope          []string          `json:"scope"`
	ExpireTime     time.Time         `json:"expireTime"`
}

func newServiceAccounts(events fakenet.Emitter) fakenet.Fake {
	s := &ServiceAccounts{Accounts: map[string]*ServiceAccount{}, events: events}
	mux := http.NewServeMux()
	// The method rides on the last segment, <email>:generateAccessToken, which a
	// pattern cannot split, so the handler does.
	mux.HandleFunc("POST /v1/projects/{project}/serviceAccounts/{call}", s.serviceAccountCall)
	s.mux = mux
	return s
}

func (s *ServiceAccounts) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

func writeGoogleError(w http.ResponseWriter, code int, status, message string) {
	writeJSON(w, code, map[string]any{"error": map[string]any{"code": code, "message": message, "status": status}})
}

func (s *ServiceAccounts) serviceAccountCall(w http.ResponseWriter, r *http.Request) {
	email, method, _ := strings.Cut(r.PathValue("call"), ":")
	if method != "generateAccessToken" || r.PathValue("project") != "-" {
		writeGoogleError(w, http.StatusNotFound, "NOT_FOUND", "Method not found.")
		return
	}

	token, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	who, ok := lookupFederated(token)
	if !ok || time.Now().After(who.ExpiresAt) {
		writeGoogleError(w, http.StatusUnauthorized, "UNAUTHENTICATED",
			"Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.")
		return
	}

	var in struct {
		Scope    []string `json:"scope"`
		Lifetime string   `json:"lifetime"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeGoogleError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Invalid JSON payload received.")
		return
	}
	if len(in.Scope) == 0 {
		writeGoogleError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "Scope required.")
		return
	}
	lifetime := maxAccessTokenLifetime
	if in.Lifetime != "" {
		d, err := time.ParseDuration(in.Lifetime)
		if err != nil || !strings.HasSuffix(in.Lifetime, "s") || d <= 0 {
			writeGoogleError(w, http.StatusBadRequest, "INVALID_ARGUMENT", fmt.Sprintf("Invalid value at 'lifetime' (type.googleapis.com/google.protobuf.Duration), %q", in.Lifetime))
			return
		}
		if d > maxAccessTokenLifetime {
			writeGoogleError(w, http.StatusBadRequest, "INVALID_ARGUMENT", "The lifetime must be less than or equal to 3600 seconds.")
			return
		}
		lifetime = d
	}

	s.mu.Lock()
	account, exists := s.Accounts[email]
	allowed := exists && slices.ContainsFunc(who.members(), func(m string) bool {
		return slices.Contains(account.WorkloadIdentityUsers, m)
	})
	if !allowed {
		s.mu.Unlock()
		// GCP answers a missing account and a missing grant alike, so a caller cannot
		// probe which service accounts exist.
		writeGoogleError(w, http.StatusForbidden, "PERMISSION_DENIED",
			"Permission 'iam.serviceAccounts.getAccessToken' denied on resource (or it may not exist).")
		return
	}
	issued := AccessToken{
		ServiceAccount: email,
		Subject:        who.Subject,
		Attributes:     who.Attributes,
		Scope:          in.Scope,
		ExpireTime:     time.Now().Add(lifetime).UTC().Truncate(time.Second),
	}
	s.Issued = append(s.Issued, issued)
	s.mu.Unlock()
	s.events.Publish(AccessTokenIssued{AccessToken: issued})

	writeJSON(w, http.StatusOK, map[string]string{
		"accessToken": "ya29.c." + randomHex(32),
		"expireTime":  issued.ExpireTime.Format(time.RFC3339),
	})
}

func (s *ServiceAccounts) Snapshot() ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return json.Marshal(struct {
		Accounts map[string]*ServiceAccount `json:"accounts"`
		Issued   []AccessToken              `json:"issued"`
	}{s.Accounts, s.Issued})
}

// Seed adds service accounts, merging members into one that already exists.
func (s *ServiceAccounts) Seed(raw []byte) error {
	var in struct {
		Accounts map[string]*ServiceAccount `json:"accounts"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for email, acct := range in.Accounts {
		dst, ok := s.Accounts[email]
		if !ok {
			dst = &ServiceAccount{WorkloadIdentityUsers: []string{}}
			s.Accounts[email] = dst
		}
		if acct == nil {
			continue
		}
		for _, m := range acct.WorkloadIdentityUsers {
			if !slices.Contains(dst.WorkloadIdentityUsers, m) {
				dst.WorkloadIdentityUsers = append(dst.WorkloadIdentityUsers, m)
			}
		}
	}
	return nil
}
