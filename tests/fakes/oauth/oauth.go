// Package oauth fakes the OAuth providers Infisical offers as user login: Google,
// GitHub and GitLab.
//
// The browser half of a login is the test's. It reads the state Infisical put on the
// authorization redirect, seeds a code for a person, and hands the code to Infisical's
// callback, which redeems it here on the provider's real hostname. The code is the
// scope: the token endpoint answers with the code itself as the access token, so the
// profile calls that follow land in the same scope. A grant seeded with the PKCE challenge from
// Infisical's redirect refuses a token request whose verifier does not match it, as the
// provider would.
//
// GitHub serves profiles from api.github.com, which the github fake owns, so a GitHub
// login seeds that fake's account under the code. This package only answers the token
// endpoint on github.com.
//
// www.googleapis.com also serves GCP service account certificates for machine identity
// GCP auth, scoped by the service account's email.
package oauth

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// The OAuth apps Infisical boots with. A token request with other credentials is
// refused, as the real provider would.
const (
	GoogleClientID     = "harness-google-client"
	GoogleClientSecret = "harness-google-secret"
	GitHubClientID     = "harness-github-client"
	GitHubClientSecret = "harness-github-secret"
	GitLabClientID     = "harness-gitlab-client"
	GitLabClientSecret = "harness-gitlab-secret"
)

type provider int

const (
	providerGoogle provider = iota
	providerGitHub
	providerGitLab
)

type service struct {
	host     string
	provider provider
}

var (
	Google = service{host: "www.googleapis.com", provider: providerGoogle}
	GitHub = service{host: "github.com", provider: providerGitHub}
	GitLab = service{host: "gitlab.com", provider: providerGitLab}
)

func (s service) Host() string { return s.host }

// Scope is the authorization code on the token endpoint, and the bearer token (which is
// the same code) on profile calls. GCP certificate lookups are scoped by the service
// account they name.
func (s service) Scope(r *http.Request) (string, bool) {
	if r.URL.Path == "/oauth2/v1/certs" {
		return googleSignOnScope, true
	}
	if sa, ok := strings.CutPrefix(r.URL.Path, "/service_accounts/v1/metadata/x509/"); ok {
		return sa, sa != ""
	}
	if r.Method == http.MethodPost {
		if err := r.ParseForm(); err != nil {
			return "", false
		}
		code := r.PostForm.Get("code")
		return code, code != ""
	}
	// Google's userinfo call carries the token as a query parameter rather than a
	// header.
	if token := r.URL.Query().Get("access_token"); token != "" {
		return token, true
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return token, ok && token != ""
}

func (s service) New(events fakenet.Emitter) fakenet.Fake {
	g := &Grant{provider: s.provider, events: events}
	g.mux = g.routes()
	return g
}

// Grant is one authorization code and who it logs in, or one GCP service account's
// certificates.
type Grant struct {
	// Profile is who the code logs in. Field names follow each provider's own API.
	Profile *Profile `json:"profile,omitempty"`

	// Certs are a GCP service account's signing certificates, PEM by key id.
	Certs map[string]string `json:"certs,omitempty"`

	// CodeChallenge is the PKCE S256 challenge from the authorization redirect. When set,
	// the token request must carry the verifier it was derived from.
	CodeChallenge string `json:"codeChallenge,omitempty"`

	// Redeemed is set once Infisical exchanged the code.
	Redeemed bool `json:"redeemed"`

	mu       sync.Mutex
	mux      *http.ServeMux
	provider provider
	events   fakenet.Emitter
}

// Profile is a provider's user. Google reads Subject, Email, EmailVerified, GivenName and
// FamilyName; GitLab reads ID, Username, Email, Name and ConfirmedAt.
type Profile struct {
	Subject       string `json:"sub,omitempty"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
	GivenName     string `json:"givenName,omitempty"`
	FamilyName    string `json:"familyName,omitempty"`

	ID          int64  `json:"id,omitempty"`
	Username    string `json:"username,omitempty"`
	Name        string `json:"name,omitempty"`
	ConfirmedAt string `json:"confirmedAt,omitempty"`
}

// CodeRedeemed is published when Infisical exchanges a code.
type CodeRedeemed struct {
	Host string `json:"host"`
}

func (CodeRedeemed) EventName() string { return "oauth.code-redeemed" }

func (g *Grant) ServeHTTP(w http.ResponseWriter, r *http.Request) { g.mux.ServeHTTP(w, r) }

func (g *Grant) routes() *http.ServeMux {
	mux := http.NewServeMux()
	switch g.provider {
	case providerGoogle:
		mux.HandleFunc("POST /oauth2/v4/token", g.token(GoogleClientID, GoogleClientSecret))
		mux.HandleFunc("POST /token", g.token(GoogleClientID, GoogleClientSecret))
		mux.HandleFunc("GET /oauth2/v3/userinfo", g.googleUserinfo)
		mux.HandleFunc("GET /service_accounts/v1/metadata/x509/{sa}", g.certs)
		mux.HandleFunc("GET /oauth2/v1/certs", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{GoogleSignOnKeyID: googleSignOnCertPEM})
		})
	case providerGitHub:
		mux.HandleFunc("POST /login/oauth/access_token", g.token(GitHubClientID, GitHubClientSecret))
	case providerGitLab:
		mux.HandleFunc("POST /oauth/token", g.token(GitLabClientID, GitLabClientSecret))
		mux.HandleFunc("GET /api/v4/user", g.gitlabUser)
	}
	return mux
}

// token redeems a code once. The access token is the code, which keeps profile calls in
// this scope.
func (g *Grant) token(clientID, clientSecret string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, secret, ok := r.BasicAuth()
		if !ok {
			id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
		}
		if id != clientID || secret != clientSecret {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_client"})
			return
		}
		code := r.PostForm.Get("code")
		g.mu.Lock()
		if g.CodeChallenge != "" {
			sum := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
			if base64.RawURLEncoding.EncodeToString(sum[:]) != g.CodeChallenge {
				g.mu.Unlock()
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant", "error_description": "PKCE verification failed"})
				return
			}
		}
		if g.Redeemed {
			g.mu.Unlock()
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_grant"})
			return
		}
		g.Redeemed = true
		g.mu.Unlock()
		g.events.Publish(CodeRedeemed{Host: r.Host})
		writeJSON(w, http.StatusOK, map[string]any{
			"access_token": code,
			"token_type":   "bearer",
			"expires_in":   3600,
			"scope":        "user:email",
		})
	}
}

func (g *Grant) googleUserinfo(w http.ResponseWriter, _ *http.Request) {
	g.mu.Lock()
	p := g.Profile
	g.mu.Unlock()
	if p == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_token"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"sub":            p.Subject,
		"email":          p.Email,
		"email_verified": p.EmailVerified,
		"given_name":     p.GivenName,
		"family_name":    p.FamilyName,
		"name":           strings.TrimSpace(p.GivenName + " " + p.FamilyName),
	})
}

func (g *Grant) gitlabUser(w http.ResponseWriter, _ *http.Request) {
	g.mu.Lock()
	p := g.Profile
	g.mu.Unlock()
	if p == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "401 Unauthorized"})
		return
	}
	var confirmed any
	if p.ConfirmedAt != "" {
		confirmed = p.ConfirmedAt
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":           p.ID,
		"username":     p.Username,
		"name":         p.Name,
		"email":        p.Email,
		"confirmed_at": confirmed,
		"avatar_url":   "",
		"web_url":      "https://gitlab.com/" + p.Username,
	})
}

func (g *Grant) certs(w http.ResponseWriter, _ *http.Request) {
	g.mu.Lock()
	certs := g.Certs
	g.mu.Unlock()
	if certs == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": map[string]any{"code": 404, "message": "Not Found"}})
		return
	}
	writeJSON(w, http.StatusOK, certs)
}

func (g *Grant) Snapshot() ([]byte, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	return json.Marshal(struct {
		Profile       *Profile          `json:"profile,omitempty"`
		Certs         map[string]string `json:"certs,omitempty"`
		CodeChallenge string            `json:"codeChallenge,omitempty"`
		Redeemed      bool              `json:"redeemed"`
	}{g.Profile, g.Certs, g.CodeChallenge, g.Redeemed})
}

func (g *Grant) Seed(raw []byte) error {
	var in struct {
		Profile       *Profile          `json:"profile"`
		Certs         map[string]string `json:"certs"`
		CodeChallenge string            `json:"codeChallenge"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if in.Profile != nil {
		g.Profile = in.Profile
	}
	if in.CodeChallenge != "" {
		g.CodeChallenge = in.CodeChallenge
	}
	if in.Certs != nil {
		if g.Certs == nil {
			g.Certs = map[string]string{}
		}
		for k, v := range in.Certs {
			g.Certs[k] = v
		}
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
