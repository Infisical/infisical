package gcp

import (
	"bytes"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

const (
	grantTokenExchange   = "urn:ietf:params:oauth:grant-type:token-exchange"
	tokenTypeAccessToken = "urn:ietf:params:oauth:token-type:access_token"
	tokenTypeJWT         = "urn:ietf:params:oauth:token-type:jwt"
	tokenTypeIDToken     = "urn:ietf:params:oauth:token-type:id_token"

	// maxSubjectBytes is GCP's limit on the mapped google.subject.
	maxSubjectBytes = 127

	// maxTokenLifetime is the longest-lived external token STS accepts.
	maxTokenLifetime = 24 * time.Hour
)

// Pool is one workload identity pool, addressed by the pool id a test invents. It
// holds the pool's OIDC providers and every exchange STS accepted for it.
type Pool struct {
	Providers map[string]*Provider `json:"providers"`
	Exchanges []Exchange           `json:"exchanges"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
	keys   *http.Client
}

// Provider is an OIDC workload identity pool provider, by its provider id.
type Provider struct {
	// IssuerURI is the issuer the provider trusts. STS fetches its discovery document
	// and keys from here when a token arrives, and the token's iss must equal it.
	IssuerURI string `json:"issuerUri"`

	// AllowedAudiences are the aud values accepted. Empty accepts only the default,
	// https://iam.googleapis.com/<provider resource name>, as GCP does.
	AllowedAudiences []string `json:"allowedAudiences,omitempty"`

	// AttributeMapping maps a Google attribute (google.subject, attribute.<name>) to an
	// expression. Only assertion.<claim> is supported: it is the only form the provider
	// Infisical documents uses, and a CEL subset would be a second thing to get wrong.
	AttributeMapping map[string]string `json:"attributeMapping"`

	// DialOrigin, when set, is the origin STS dials for the issuer's discovery document
	// and keys in place of the issuer URI's own origin; the path is kept. Google dials
	// the issuer over the internet. A harness instance's SITE_URL names https while the
	// server listens on plain http, so a test points this at the instance's internal
	// address to let the fake reach the same documents Google would.
	DialOrigin string `json:"dialOrigin,omitempty"`
}

// Exchange is one external token STS accepted: what the token said and what the
// provider mapped from it.
type Exchange struct {
	Provider   string            `json:"provider"`
	Issuer     string            `json:"issuer"`
	Subject    string            `json:"subject"`
	Audience   []string          `json:"audience"`
	Attributes map[string]string `json:"attributes"`
}

func newPool(events fakenet.Emitter) fakenet.Fake {
	p := &Pool{Providers: map[string]*Provider{}, events: events, keys: &http.Client{Timeout: 5 * time.Second}}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/token", p.token)
	p.mux = mux
	return p
}

func (p *Pool) ServeHTTP(w http.ResponseWriter, r *http.Request) { p.mux.ServeHTTP(w, r) }

type stsError struct {
	status      int
	code        string
	description string
}

func (e *stsError) Error() string { return e.code + ": " + e.description }

func invalidGrant(format string, args ...any) *stsError {
	return &stsError{http.StatusBadRequest, "invalid_grant", fmt.Sprintf(format, args...)}
}

func invalidRequest(format string, args ...any) *stsError {
	return &stsError{http.StatusBadRequest, "invalid_request", fmt.Sprintf(format, args...)}
}

func writeSTSError(w http.ResponseWriter, e *stsError) {
	writeJSON(w, e.status, map[string]string{"error": e.code, "error_description": e.description})
}

// token is POST /v1/token with a JSON body, as Google's client libraries send it.
func (p *Pool) token(w http.ResponseWriter, r *http.Request) {
	var in struct {
		GrantType          string `json:"grantType"`
		Audience           string `json:"audience"`
		Scope              string `json:"scope"`
		RequestedTokenType string `json:"requestedTokenType"`
		SubjectToken       string `json:"subjectToken"`
		SubjectTokenType   string `json:"subjectTokenType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeSTSError(w, invalidRequest("Invalid JSON payload received."))
		return
	}
	if in.GrantType != grantTokenExchange {
		writeSTSError(w, &stsError{http.StatusBadRequest, "unsupported_grant_type",
			fmt.Sprintf("Unsupported grant type: %q.", in.GrantType)})
		return
	}
	if in.RequestedTokenType != tokenTypeAccessToken {
		writeSTSError(w, invalidRequest("Invalid requested_token_type: %q.", in.RequestedTokenType))
		return
	}
	if in.SubjectTokenType != tokenTypeJWT && in.SubjectTokenType != tokenTypeIDToken {
		writeSTSError(w, invalidRequest("Invalid subject_token_type: %q.", in.SubjectTokenType))
		return
	}
	if in.SubjectToken == "" {
		writeSTSError(w, invalidRequest("subject_token is required."))
		return
	}
	// GCP requires a scope when it exchanges an external credential for an access token
	if strings.TrimSpace(in.Scope) == "" {
		writeSTSError(w, invalidRequest("scope is required when exchanging an external credential for a Google access token."))
		return
	}

	name, _ := parseProviderAudience(in.Audience)
	p.mu.Lock()
	provider, found := p.Providers[name.Provider]
	var prov Provider
	if found {
		prov = *provider
	}
	p.mu.Unlock()
	if !found || name.ProjectNumber != ProjectNumber(name.Pool) {
		writeSTSError(w, &stsError{http.StatusBadRequest, "invalid_target",
			"The target service indicated by the \"audience\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn't exist."})
		return
	}

	ex, expiresAt, sErr := p.verify(prov, name, in.SubjectToken)
	if sErr != nil {
		writeSTSError(w, sErr)
		return
	}

	access := issueFederated(identity{
		ProjectNumber: name.ProjectNumber,
		Pool:          name.Pool,
		Subject:       ex.Subject,
		Attributes:    ex.Attributes,
		ExpiresAt:     expiresAt,
	})

	p.mu.Lock()
	p.Exchanges = append(p.Exchanges, ex)
	p.mu.Unlock()
	p.events.Publish(TokenExchanged{Exchange: ex})

	writeJSON(w, http.StatusOK, map[string]any{
		"access_token":      access,
		"issued_token_type": tokenTypeAccessToken,
		"token_type":        "Bearer",
		"expires_in":        int(time.Until(expiresAt).Seconds()),
	})
}

// verify checks the external token as STS does: its issuer is the provider's, its
// signature verifies against a key the issuer publishes now, its audience is one the
// provider allows, and it is within its lifetime. Then it maps the attributes.
func (p *Pool) verify(prov Provider, name ProviderName, token string) (Exchange, time.Time, *stsError) {
	header, claims, signed, sig, err := parseJWT(token)
	if err != nil {
		return Exchange{}, time.Time{}, invalidGrant("Unable to parse the ID Token.")
	}
	if header.Alg != "RS256" {
		return Exchange{}, time.Time{}, invalidGrant("The ID Token's signing algorithm %s is not supported.", header.Alg)
	}

	iss, _ := claims["iss"].(string)
	if iss != prov.IssuerURI {
		return Exchange{}, time.Time{}, invalidGrant("The issuer in ID Token %s does not match the expected ones: %s.", iss, prov.IssuerURI)
	}

	keys, err := p.fetchKeys(prov)
	if err != nil {
		return Exchange{}, time.Time{}, invalidGrant("Failed to fetch the OIDC keys from the issuer %s: %v.", prov.IssuerURI, err)
	}
	if !verifiesWithAny(keys, header.Kid, signed, sig) {
		return Exchange{}, time.Time{}, invalidGrant("Invalid ID Token signature.")
	}

	audiences := stringOrList(claims["aud"])
	allowed := prov.AllowedAudiences
	if len(allowed) == 0 {
		allowed = []string{"https://iam.googleapis.com/" + name.String()}
	}
	if !intersects(audiences, allowed) {
		return Exchange{}, time.Time{}, invalidGrant("The audience in ID Token [%s] does not match the expected audience.", strings.Join(audiences, ", "))
	}

	exp, okExp := numericClaim(claims["exp"])
	iat, okIat := numericClaim(claims["iat"])
	if !okExp || !okIat {
		return Exchange{}, time.Time{}, invalidGrant("The ID Token must have exp and iat claims.")
	}
	now := time.Now()
	expiresAt := time.Unix(exp, 0)
	if !now.Before(expiresAt) {
		return Exchange{}, time.Time{}, invalidGrant("ID Token expired at %s.", expiresAt.UTC().Format(time.RFC3339))
	}
	if time.Unix(iat, 0).After(now.Add(time.Minute)) {
		return Exchange{}, time.Time{}, invalidGrant("ID Token is issued in the future.")
	}
	if expiresAt.Sub(time.Unix(iat, 0)) > maxTokenLifetime {
		return Exchange{}, time.Time{}, invalidGrant("The lifetime of the ID Token exceeds 24 hours.")
	}

	attrs := map[string]string{}
	subject := ""
	for target, expr := range prov.AttributeMapping {
		claim, _ := strings.CutPrefix(expr, "assertion.")
		v, ok := claims[claim]
		if !ok {
			continue
		}
		value := fmt.Sprint(v)
		if target == "google.subject" {
			subject = value
			continue
		}
		if attr, isAttr := strings.CutPrefix(target, "attribute."); isAttr {
			attrs[attr] = value
		}
	}
	if subject == "" {
		return Exchange{}, time.Time{}, invalidRequest("The mapped attribute google.subject must not be empty.")
	}
	if len(subject) > maxSubjectBytes {
		return Exchange{}, time.Time{}, invalidRequest("The size of mapped attribute google.subject exceeds the 127 bytes limit. Either modify your attribute mapping or the incoming assertion to produce a mapped attribute that is less than 127 bytes.")
	}

	return Exchange{
		Provider:   name.String(),
		Issuer:     iss,
		Subject:    subject,
		Audience:   audiences,
		Attributes: attrs,
	}, expiresAt, nil
}

type jwtHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
}

func parseJWT(token string) (jwtHeader, map[string]any, []byte, []byte, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return jwtHeader{}, nil, nil, nil, errors.New("not a JWS compact serialization")
	}
	rawHeader, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return jwtHeader{}, nil, nil, nil, err
	}
	rawClaims, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return jwtHeader{}, nil, nil, nil, err
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return jwtHeader{}, nil, nil, nil, err
	}
	var header jwtHeader
	if err := json.Unmarshal(rawHeader, &header); err != nil {
		return jwtHeader{}, nil, nil, nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(rawClaims))
	dec.UseNumber()
	var claims map[string]any
	if err := dec.Decode(&claims); err != nil {
		return jwtHeader{}, nil, nil, nil, err
	}
	return header, claims, []byte(parts[0] + "." + parts[1]), sig, nil
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// fetchKeys reads the issuer's discovery document and the JWKS it names, on every
// exchange: an issuer creates its key on first use, so keys cannot be known ahead.
func (p *Pool) fetchKeys(prov Provider) ([]jwk, error) {
	discoveryURL, err := prov.dial(strings.TrimSuffix(prov.IssuerURI, "/") + "/.well-known/openid-configuration")
	if err != nil {
		return nil, err
	}
	var discovery struct {
		Issuer  string `json:"issuer"`
		JwksURI string `json:"jwks_uri"`
	}
	if err := p.getJSON(discoveryURL, &discovery); err != nil {
		return nil, err
	}
	if discovery.Issuer != prov.IssuerURI {
		return nil, fmt.Errorf("the discovery document names the issuer %s", discovery.Issuer)
	}
	jwksURL, err := prov.dial(discovery.JwksURI)
	if err != nil {
		return nil, err
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := p.getJSON(jwksURL, &set); err != nil {
		return nil, err
	}
	return set.Keys, nil
}

func (p *Pool) getJSON(target string, out any) error {
	res, err := p.keys.Get(target)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s returned %d", target, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// dial swaps the issuer's origin for DialOrigin on a URL under that origin.
func (prov Provider) dial(raw string) (string, error) {
	if prov.DialOrigin == "" {
		return raw, nil
	}
	issuer, err := url.Parse(prov.IssuerURI)
	if err != nil {
		return "", err
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != issuer.Scheme || u.Host != issuer.Host {
		return raw, nil
	}
	return strings.TrimSuffix(prov.DialOrigin, "/") + u.RequestURI(), nil
}

func verifiesWithAny(keys []jwk, kid string, signed, sig []byte) bool {
	digest := sha256.Sum256(signed)
	for _, k := range keys {
		if k.Kty != "RSA" || (kid != "" && k.Kid != kid) {
			continue
		}
		n, errN := base64.RawURLEncoding.DecodeString(k.N)
		e, errE := base64.RawURLEncoding.DecodeString(k.E)
		if errN != nil || errE != nil {
			continue
		}
		pub := &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
		if rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig) == nil {
			return true
		}
	}
	return false
}

func stringOrList(v any) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case []any:
		out := make([]string, 0, len(t))
		for _, item := range t {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

func intersects(a, b []string) bool {
	for _, x := range a {
		for _, y := range b {
			if x == y {
				return true
			}
		}
	}
	return false
}

func numericClaim(v any) (int64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	if i, err := n.Int64(); err == nil {
		return i, true
	}
	f, err := n.Float64()
	if err != nil {
		return 0, false
	}
	return int64(f), true
}

func (p *Pool) Snapshot() ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return json.Marshal(struct {
		Providers map[string]*Provider `json:"providers"`
		Exchanges []Exchange           `json:"exchanges"`
	}{p.Providers, p.Exchanges})
}

// Seed adds or replaces providers by id.
func (p *Pool) Seed(raw []byte) error {
	var in struct {
		Providers map[string]*Provider `json:"providers"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	for id, prov := range in.Providers {
		if prov == nil || prov.IssuerURI == "" {
			return fmt.Errorf("gcp: provider %s needs an issuerUri", id)
		}
		if _, ok := prov.AttributeMapping["google.subject"]; !ok {
			return fmt.Errorf("gcp: provider %s needs a google.subject mapping, as GCP requires for OIDC", id)
		}
		for target, expr := range prov.AttributeMapping {
			if target != "google.subject" && !strings.HasPrefix(target, "attribute.") {
				return fmt.Errorf("gcp: provider %s maps %s; only google.subject and attribute.<name> are supported", id, target)
			}
			if !strings.HasPrefix(expr, "assertion.") {
				return fmt.Errorf("gcp: provider %s maps %s to %q; only assertion.<claim> is supported", id, target, expr)
			}
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for id, prov := range in.Providers {
		p.Providers[id] = prov
	}
	return nil
}
