package acme_test

import (
	"bytes"
	"context"
	"crypto"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

var b64 = base64.RawURLEncoding

// acmeClient speaks RFC 8555 to one profile of one application, as an ACME client
// such as certbot would.
//
// Infisical builds every ACME URL from SITE_URL and checks each JWS url against the
// URL the request arrived on, but SITE_URL names the container on the Docker network,
// which the test process cannot dial. So requests go to the published port with
// X-Forwarded-Proto and X-Forwarded-Host naming SITE_URL's origin, which Infisical
// trusts, and everything signed or compared uses the SITE_URL form.
type acmeClient struct {
	api     *api.ClientWithResponses
	site    string
	app     uuid.UUID
	profile uuid.UUID
	key     *rsa.PrivateKey
	nonce   string

	// AccountURL is the account's kid once registered.
	AccountURL string
}

// acmeResponse is any ACME answer: the status, headers and raw body.
type acmeResponse struct {
	Status int
	Header http.Header
	Body   []byte
}

// problem is an RFC 7807 problem document.
type problem struct {
	Type   string `json:"type"`
	Detail string `json:"detail"`
	Status int    `json:"status"`
}

type identifier struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type orderBody struct {
	Status         string       `json:"status"`
	Identifiers    []identifier `json:"identifiers"`
	Authorizations []string     `json:"authorizations"`
	Finalize       string       `json:"finalize"`
	Certificate    string       `json:"certificate"`
}

type challengeBody struct {
	Type   string `json:"type"`
	URL    string `json:"url"`
	Token  string `json:"token"`
	Status string `json:"status"`
}

type authzBody struct {
	Status     string          `json:"status"`
	Identifier identifier      `json:"identifier"`
	Challenges []challengeBody `json:"challenges"`
}

func newClient(t *testing.T, tn *harness.Tenant, app pki.Application, profile pki.Profile) *acmeClient {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return newClientWithKey(t, tn, app, profile, key)
}

func newClientWithKey(t *testing.T, tn *harness.Tenant, app pki.Application, profile pki.Profile, key *rsa.PrivateKey) *acmeClient {
	t.Helper()
	site := harness.From(t).App().SiteURL()
	origin, err := url.Parse(site)
	require.NoError(t, err)
	forwarded := api.WithRequestEditorFn(func(_ context.Context, req *http.Request) error {
		req.Header.Set("X-Forwarded-Proto", origin.Scheme)
		req.Header.Set("X-Forwarded-Host", origin.Host)
		return nil
	})
	return &acmeClient{api: tn.Anonymous(t, forwarded), site: site, app: app.ID, profile: profile.ID, key: key}
}

// URL is a path on Infisical as the server names it.
func (c *acmeClient) URL(path string) string { return c.site + path }

func (c *acmeClient) profilePath() string {
	return "/api/v1/cert-manager/acme/profiles/" + c.profile.String()
}

// NewAccountURL is the application-scoped new-account URL the directory hands out.
func (c *acmeClient) NewAccountURL() string {
	return c.URL("/api/v1/cert-manager/acme/applications/" + c.app.String() + "/profiles/" + c.profile.String() + "/new-account")
}

func (c *acmeClient) NewOrderURL() string { return c.URL(c.profilePath() + "/new-order") }

// OrdersURL is the account's order list.
func (c *acmeClient) OrdersURL() string {
	return c.AccountURL + "/orders"
}

func (c *acmeClient) jwk() map[string]string {
	return map[string]string{
		"e":   b64.EncodeToString(big.NewInt(int64(c.key.E)).Bytes()),
		"kty": "RSA",
		"n":   b64.EncodeToString(c.key.N.Bytes()),
	}
}

// thumbprint is the RFC 7638 thumbprint of the account key.
func (c *acmeClient) thumbprint() string {
	j := c.jwk()
	d := sha256.Sum256([]byte(fmt.Sprintf(`{"e":%q,"kty":"RSA","n":%q}`, j["e"], j["n"])))
	return b64.EncodeToString(d[:])
}

// KeyAuthorization is what an HTTP-01 challenge serves for a token.
func (c *acmeClient) KeyAuthorization(token string) string { return token + "." + c.thumbprint() }

// DNSValue is the TXT value a DNS-01 challenge publishes for a token.
func (c *acmeClient) DNSValue(token string) string {
	d := sha256.Sum256([]byte(c.KeyAuthorization(token)))
	return b64.EncodeToString(d[:])
}

// Nonce returns an unused nonce, asking new-nonce when none is in hand.
func (c *acmeClient) Nonce(t *testing.T) string {
	t.Helper()
	if c.nonce != "" {
		n := c.nonce
		c.nonce = ""
		return n
	}
	res, err := c.api.GetAcmeNewNonceWithResponse(t.Context(), c.profile, asHEAD)
	require.NoError(t, err)
	n := res.HTTPResponse.Header.Get("Replay-Nonce")
	require.NotEmptyf(t, n, "new-nonce returned %d without a Replay-Nonce", res.StatusCode())
	return n
}

// Header is the protected header the client would send to url.
func (c *acmeClient) Header(t *testing.T, url string) map[string]any {
	t.Helper()
	h := map[string]any{"alg": "RS256", "nonce": c.Nonce(t), "url": url}
	if c.AccountURL != "" {
		h["kid"] = c.AccountURL
	} else {
		h["jwk"] = c.jwk()
	}
	return h
}

// Post signs payload under the client's own header for url and sends it. A nil
// payload is a POST-as-GET.
func (c *acmeClient) Post(t *testing.T, url string, payload any) acmeResponse {
	t.Helper()
	return c.PostRaw(t, url, c.Header(t, url), encodePayload(t, payload))
}

// PostRaw signs exactly the header and payload given and sends them to url, for a
// request a well-behaved client would never make.
func (c *acmeClient) PostRaw(t *testing.T, url string, header map[string]any, payload []byte) acmeResponse {
	t.Helper()
	body, err := json.Marshal(c.sign(t, header, payload))
	require.NoError(t, err)
	res := c.send(t, url, body)
	n := res.Header.Get("Replay-Nonce")
	if res.Status < http.StatusMultipleChoices {
		require.NotEmptyf(t, n, "a successful POST to %s carried no Replay-Nonce (RFC 8555 7.2)", url)
	}
	if n != "" {
		c.nonce = n
	}
	return res
}

// asHEAD sends new-nonce as HEAD, as certbot, lego and cert-manager do. The spec
// lists only its GET, because the OpenAPI generator leaves HEAD routes out.
var asHEAD = api.RequestEditorFn(func(_ context.Context, req *http.Request) error {
	req.Method = http.MethodHead
	return nil
})

func (c *acmeClient) sign(t *testing.T, header map[string]any, payload []byte) map[string]string {
	t.Helper()
	rawHeader, err := json.Marshal(header)
	require.NoError(t, err)
	protected := b64.EncodeToString(rawHeader)
	encoded := b64.EncodeToString(payload)
	digest := sha256.Sum256([]byte(protected + "." + encoded))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.key, crypto.SHA256, digest[:])
	require.NoError(t, err)
	return map[string]string{"protected": protected, "payload": encoded, "signature": b64.EncodeToString(sig)}
}

func encodePayload(t *testing.T, payload any) []byte {
	t.Helper()
	switch p := payload.(type) {
	case nil:
		return nil
	case []byte:
		return p
	default:
		raw, err := json.Marshal(p)
		require.NoError(t, err)
		return raw
	}
}

var acmeRoutes = []struct {
	pattern *regexp.Regexp
	call    func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error)
}{
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/applications/([^/]+)/profiles/([^/]+)/new-account$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.CreateAcmeApplicationAccountWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/new-order$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.CreateAcmeOrderWithBodyWithResponse(ctx, mustUUID(m[1]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/accounts/([^/]+)/orders$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.ListAcmeOrdersWithBodyWithResponse(ctx, mustUUID(m[1]), m[2], jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/orders/([^/]+)$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.GetAcmeOrderWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/orders/([^/]+)/finalize$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.FinalizeAcmeOrderWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/orders/([^/]+)/certificate$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.DownloadAcmeCertificateWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/authorizations/([^/]+)$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.GetAcmeAuthorizationWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
	{regexp.MustCompile(`^/api/v1/cert-manager/acme/profiles/([^/]+)/authorizations/([^/]+)/challenges/([^/]+)$`),
		func(c *acmeClient, ctx context.Context, m []string, body []byte) (*http.Response, []byte, error) {
			r, err := c.api.RespondToAcmeChallengeWithBodyWithResponse(ctx, mustUUID(m[1]), mustUUID(m[2]), mustUUID(m[3]), jose, bytes.NewReader(body))
			if err != nil {
				return nil, nil, err
			}
			return r.HTTPResponse, r.Body, nil
		}},
}

const jose = "application/jose+json"

// send dispatches a URL Infisical handed out to the generated operation that serves
// it, so even a URL taken from a response goes through the generated client.
func (c *acmeClient) send(t *testing.T, target string, body []byte) acmeResponse {
	t.Helper()
	path := strings.TrimPrefix(target, c.site)
	require.NotEqualf(t, target, path, "%s is not a URL on this Infisical (%s)", target, c.site)
	for _, r := range acmeRoutes {
		if m := r.pattern.FindStringSubmatch(path); m != nil {
			res, raw, err := r.call(c, t.Context(), m, body)
			require.NoError(t, err)
			return acmeResponse{Status: res.StatusCode, Header: res.Header, Body: raw}
		}
	}
	t.Fatalf("no ACME operation serves %s", path)
	return acmeResponse{}
}

func mustUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		panic(fmt.Sprintf("acme: %q is not a UUID", s))
	}
	return id
}

// Problem decodes a response as a problem document.
func (r acmeResponse) Problem(t *testing.T) problem {
	t.Helper()
	var p problem
	require.NoErrorf(t, json.Unmarshal(r.Body, &p), "decoding a problem from %d: %s", r.Status, apierr.Body(r.Body))
	return p
}

// Decode reads the body into v, failing on a status that is not want.
func (r acmeResponse) Decode(t *testing.T, want int, v any) {
	t.Helper()
	require.Equalf(t, want, r.Status, "ACME answered %d: %s", r.Status, apierr.Body(r.Body))
	require.NoError(t, json.Unmarshal(r.Body, v))
}

// Register creates the account with the profile's EAB credentials.
func (c *acmeClient) Register(t *testing.T, eab pki.EAB) acmeResponse {
	t.Helper()
	res := c.Post(t, c.NewAccountURL(), map[string]any{
		"contact":                []string{"mailto:pki@harness.test"},
		"termsOfServiceAgreed":   true,
		"externalAccountBinding": c.EAB(t, eab.KID, eab.Secret, c.NewAccountURL()),
	})
	if res.Status == http.StatusCreated || res.Status == http.StatusOK {
		c.AccountURL = res.Header.Get("Location")
	}
	return res
}

// MustRegister registers and fails the test unless an account was created.
func (c *acmeClient) MustRegister(t *testing.T, eab pki.EAB) {
	t.Helper()
	res := c.Register(t, eab)
	require.Equalf(t, http.StatusCreated, res.Status, "registering returned %d: %s", res.Status, apierr.Body(res.Body))
	require.NotEmpty(t, c.AccountURL)
}

// EAB is the externalAccountBinding JWS (RFC 8555 7.3.4): the account key signed with
// the EAB secret under kid, for url.
func (c *acmeClient) EAB(t *testing.T, kid, secret, url string) map[string]string {
	t.Helper()
	key, err := b64.DecodeString(strings.TrimRight(secret, "="))
	require.NoError(t, err)
	rawHeader, err := json.Marshal(map[string]string{"alg": "HS256", "kid": kid, "url": url})
	require.NoError(t, err)
	rawJWK, err := json.Marshal(c.jwk())
	require.NoError(t, err)
	protected, payload := b64.EncodeToString(rawHeader), b64.EncodeToString(rawJWK)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(protected + "." + payload))
	return map[string]string{"protected": protected, "payload": payload, "signature": b64.EncodeToString(mac.Sum(nil))}
}

// Order is a created order: its URL and body.
type Order struct {
	URL string
	orderBody
}

// NewOrder orders a certificate for DNS names.
func (c *acmeClient) NewOrder(t *testing.T, names ...string) Order {
	t.Helper()
	ids := make([]identifier, 0, len(names))
	for _, n := range names {
		ids = append(ids, identifier{Type: "dns", Value: n})
	}
	res := c.Post(t, c.NewOrderURL(), map[string]any{"identifiers": ids})
	var o orderBody
	res.Decode(t, http.StatusCreated, &o)
	return Order{URL: res.Header.Get("Location"), orderBody: o}
}

// Order reads an order.
func (c *acmeClient) Order(t *testing.T, url string) orderBody {
	t.Helper()
	var o orderBody
	c.Post(t, url, nil).Decode(t, http.StatusOK, &o)
	return o
}

// Authorization reads an authorization.
func (c *acmeClient) Authorization(t *testing.T, url string) authzBody {
	t.Helper()
	var a authzBody
	c.Post(t, url, nil).Decode(t, http.StatusOK, &a)
	return a
}

// Challenge returns an authorization's challenge of one type.
func (a authzBody) Challenge(t *testing.T, kind string) challengeBody {
	t.Helper()
	for _, ch := range a.Challenges {
		if ch.Type == kind {
			return ch
		}
	}
	t.Fatalf("authorization for %s has no %s challenge: %+v", a.Identifier.Value, kind, a.Challenges)
	return challengeBody{}
}

// Respond tells Infisical a challenge is ready to be checked.
func (c *acmeClient) Respond(t *testing.T, ch challengeBody) {
	t.Helper()
	res := c.Post(t, ch.URL, map[string]any{})
	require.Equalf(t, http.StatusOK, res.Status, "answering the challenge returned %d: %s", res.Status, apierr.Body(res.Body))
	authz, _, _ := strings.Cut(ch.URL, "/challenges/")
	require.Contains(t, res.Header.Values("Link"), "<"+authz+`>;rel="up"`, "the challenge response does not link up to its authorization (RFC 8555 7.5.1)")
}

// Finalize submits a CSR (DER) to an order.
func (c *acmeClient) Finalize(t *testing.T, finalizeURL string, csr []byte) acmeResponse {
	t.Helper()
	return c.Post(t, finalizeURL, map[string]string{"csr": b64.EncodeToString(csr)})
}

// Certificate downloads an order's PEM chain.
func (c *acmeClient) Certificate(t *testing.T, certificateURL string) string {
	t.Helper()
	res := c.Post(t, certificateURL, nil)
	require.Equalf(t, http.StatusOK, res.Status, "downloading the certificate returned %d: %s", res.Status, apierr.Body(res.Body))
	return string(res.Body)
}
