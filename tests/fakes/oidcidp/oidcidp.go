// Package oidcidp fakes an OpenID Connect provider for SSO login.
//
// Infisical talks to an OP server to server (discovery, JWKS, token), so the fake
// lives in fakenet. The browser half of a login is the test's: it reads the state
// Infisical put in the authorization redirect, has the control plane issue a code for
// a person, and hands both to the callback, as the OP's login page would.
//
// Each tenant's provider sits under its own path, https://idp.oidc.test/<tenant>, and
// that prefix is the scope. The issuer URL is all Infisical is configured with, so the
// prefix rides along on every call it makes.
package oidcidp

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

var Service = service{host: "idp.oidc.test"}

type service struct{ host string }

func (s service) Host() string { return s.host }

func (service) Scope(r *http.Request) (string, bool) {
	tenant, _, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	return tenant, tenant != ""
}

func (service) New(events fakenet.Emitter) fakenet.Fake {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	p := &Provider{Codes: map[string]Person{}, key: key, keyID: randomString(8), events: events}
	p.mux = p.routes()
	return p
}

// IssuerURL is the discovery base Infisical is configured with for one tenant.
func IssuerURL(tenant string) string { return "https://" + Service.Host() + "/" + tenant }

// Provider is one tenant's OP.
type Provider struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`

	// Codes are authorization codes not yet redeemed, each naming who logged in.
	Codes map[string]Person `json:"codes"`

	mu     sync.Mutex
	mux    *http.ServeMux
	key    *rsa.PrivateKey
	keyID  string
	events fakenet.Emitter
}

// Person is who the OP asserts. Subject is the stable id Infisical stores as the
// alias externalId.
type Person struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"emailVerified"`
	GivenName     string `json:"givenName"`
	FamilyName    string `json:"familyName"`
}

func (p *Provider) ServeHTTP(w http.ResponseWriter, r *http.Request) { p.mux.ServeHTTP(w, r) }

func (p *Provider) routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{tenant}/.well-known/openid-configuration", p.discovery)
	mux.HandleFunc("GET /{tenant}/jwks", p.jwks)
	mux.HandleFunc("POST /{tenant}/token", p.token)
	return mux
}

func issuer(r *http.Request) string { return "https://" + r.Host + "/" + r.PathValue("tenant") }

// discovery advertises no PKCE method on purpose: Infisical then sends a plain code
// flow, which is what the test can drive without holding a verifier.
func (p *Provider) discovery(w http.ResponseWriter, r *http.Request) {
	iss := issuer(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                                iss,
		"authorization_endpoint":                iss + "/authorize",
		"token_endpoint":                        iss + "/token",
		"userinfo_endpoint":                     iss + "/userinfo",
		"jwks_uri":                              iss + "/jwks",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post"},
		"scopes_supported":                      []string{"openid", "email", "profile"},
	})
}

func (p *Provider) jwks(w http.ResponseWriter, _ *http.Request) {
	pub := p.key.PublicKey
	writeJSON(w, http.StatusOK, map[string]any{"keys": []map[string]string{{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": p.keyID,
		"n":   b64(pub.N.Bytes()),
		"e":   b64(big.NewInt(int64(pub.E)).Bytes()),
	}}})
}

func (p *Provider) token(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthErr(w, http.StatusBadRequest, "invalid_request")
		return
	}
	clientID, secret, ok := r.BasicAuth()
	if !ok {
		clientID, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
	}

	p.mu.Lock()
	if clientID != p.ClientID || secret != p.ClientSecret {
		p.mu.Unlock()
		writeOAuthErr(w, http.StatusUnauthorized, "invalid_client")
		return
	}
	if r.PostForm.Get("grant_type") != "authorization_code" {
		p.mu.Unlock()
		writeOAuthErr(w, http.StatusBadRequest, "unsupported_grant_type")
		return
	}
	code := r.PostForm.Get("code")
	person, found := p.Codes[code]
	delete(p.Codes, code)
	p.mu.Unlock()
	if !found {
		writeOAuthErr(w, http.StatusBadRequest, "invalid_grant")
		return
	}

	now := time.Now()
	idToken, err := p.sign(map[string]any{
		"iss":            issuer(r),
		"aud":            clientID,
		"sub":            person.Subject,
		"iat":            now.Unix(),
		"exp":            now.Add(5 * time.Minute).Unix(),
		"email":          person.Email,
		"email_verified": person.EmailVerified,
		"given_name":     person.GivenName,
		"family_name":    person.FamilyName,
	})
	if err != nil {
		writeOAuthErr(w, http.StatusInternalServerError, "server_error")
		return
	}
	p.events.Publish(TokenIssued{Subject: person.Subject, Email: person.Email})
	writeJSON(w, http.StatusOK, map[string]any{
		"access_token": randomString(24),
		"token_type":   "Bearer",
		"expires_in":   300,
		"id_token":     idToken,
	})
}

func (p *Provider) sign(claims map[string]any) (string, error) {
	header, err := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT", "kid": p.keyID})
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	unsigned := b64(header) + "." + b64(payload)
	digest := sha256.Sum256([]byte(unsigned))
	sig, err := rsa.SignPKCS1v15(rand.Reader, p.key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return unsigned + "." + b64(sig), nil
}

// Snapshot marshals under the lock, so a concurrent redeem cannot mutate Codes mid-encode.
func (p *Provider) Snapshot() ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return json.Marshal(struct {
		ClientID     string            `json:"clientId"`
		ClientSecret string            `json:"clientSecret"`
		Codes        map[string]Person `json:"codes"`
	}{p.ClientID, p.ClientSecret, p.Codes})
}

// Seed merges a partial provider in, so a test names only what it cares about.
func (p *Provider) Seed(raw []byte) error {
	var in Provider
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if in.ClientID != "" {
		p.ClientID = in.ClientID
	}
	if in.ClientSecret != "" {
		p.ClientSecret = in.ClientSecret
	}
	for code, person := range in.Codes {
		p.Codes[code] = person
	}
	return nil
}

func b64(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func randomString(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return b64(buf)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeOAuthErr(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}
