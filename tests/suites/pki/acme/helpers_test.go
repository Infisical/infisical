package acme_test

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/website"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// acmeProfile is a profile of an application with ACME enrollment on, issuing from an
// internal CA under a policy that allows anything.
type acmeProfile struct {
	tn      *harness.Tenant
	project *pki.Project
	app     pki.Application
	profile pki.Profile
	eab     pki.EAB
}

func newAcmeProfile(t *testing.T, tn *harness.Tenant) acmeProfile {
	t.Helper()
	proj := pki.CertManager(t, tn)
	return newAcmeProfileFrom(t, tn, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
}

func newAcmeProfileFrom(t *testing.T, tn *harness.Tenant, proj *pki.Project, ca pki.CA, policy pki.Policy, enrollment api.SetPkiApplicationAcmeEnrollmentJSONRequestBody) acmeProfile {
	t.Helper()
	profile := pki.NewProfile(t, proj, ca, policy)
	app := pki.NewApplication(t, proj, profile)
	return acmeProfile{tn: tn, project: proj, app: app, profile: profile, eab: pki.EnableACME(t, app, profile, enrollment)}
}

func (p acmeProfile) client(t *testing.T) *acmeClient {
	t.Helper()
	return newClient(t, p.tn, p.app, p.profile)
}

// registered is a client with an account on the profile.
func (p acmeProfile) registered(t *testing.T) *acmeClient {
	t.Helper()
	c := p.client(t)
	c.MustRegister(t, p.eab)
	return c
}

// newSite is a web server for names the test makes up, which ACME HTTP-01 fetches
// from.
func newSite(t *testing.T, tn *harness.Tenant) *website.ControlPlane {
	t.Helper()
	scope := id.Nonce()
	admin := fixture.FakenetAdmin(t, tn)
	fakenet.Track(t, admin, website.Service.Host(), scope)
	return website.Open(t, admin, scope)
}

// domain is a name nobody else's test uses. Orders that never get validated can use
// any name; one a challenge is fetched from has to come from newSite.
func domain(label string) string { return website.Name(id.Nonce(), label) }

// passHTTP01 serves and answers the HTTP-01 challenge of every authorization of an
// order.
func passHTTP01(t *testing.T, c *acmeClient, site *website.ControlPlane, authorizations []string) {
	t.Helper()
	for _, url := range authorizations {
		ch := c.Authorization(t, url).Challenge(t, "http-01")
		site.Publish(t, ch.Token, c.KeyAuthorization(ch.Token))
		c.Respond(t, ch)
	}
}

// waitOrder polls an order until it reaches status.
func waitOrder(t *testing.T, c *acmeClient, url, status string, opts ...wait.Option) orderBody {
	t.Helper()
	o, err := wait.For(t.Context(), func(context.Context) (orderBody, bool, error) {
		res := c.Post(t, url, nil)
		if res.Status != http.StatusOK {
			return orderBody{}, false, fmt.Errorf("reading the order returned %d: %s", res.Status, res.Body)
		}
		var o orderBody
		res.Decode(t, http.StatusOK, &o)
		return o, o.Status == status || o.Status == "invalid", nil
	}, append([]wait.Option{pollACME}, opts...)...)
	require.NoErrorf(t, err, "waiting for the order to become %s", status)
	require.Equalf(t, status, o.Status, "the order became %s", o.Status)
	return o
}

// issue finalizes a ready order and waits for the certificate.
func issue(t *testing.T, c *acmeClient, o Order, csr []byte, opts ...wait.Option) *x509.Certificate {
	t.Helper()
	var finalized orderBody
	c.Finalize(t, o.Finalize, csr).Decode(t, http.StatusOK, &finalized)
	valid := waitOrder(t, c, o.URL, "valid", opts...)
	return leaf(t, c.Certificate(t, valid.Certificate))
}

func leaf(t *testing.T, chain string) *x509.Certificate {
	t.Helper()
	block, _ := pem.Decode([]byte(chain))
	require.NotNil(t, block, "the certificate chain holds no PEM block")
	cert, err := x509.ParseCertificate(block.Bytes)
	require.NoError(t, err)
	return cert
}

// siteName names hosts under one test's site by label.
type siteName struct{ *website.ControlPlane }

// label is the host for a label, or no name for an empty one.
func (s siteName) label(l string) string {
	if l == "" {
		return ""
	}
	return s.Name(l)
}

func (s siteName) labels(ls []string) []string {
	out := make([]string, 0, len(ls))
	for _, l := range ls {
		out = append(out, s.Name(l))
	}
	return out
}

// csrSpec is how a CSR is built: its key, signature hash, subject and SANs.
type csrSpec struct {
	keyType    string // RSA-2048, RSA-3072, RSA-4096, ECDSA-P256, ECDSA-P384, ECDSA-P521
	hash       crypto.Hash
	commonName string
	dnsNames   []string
	emptySANs  bool
}

// names is every name the CSR asks for, which is what an order for it identifies.
func (s csrSpec) names() []string {
	out := []string{}
	if s.commonName != "" {
		out = append(out, s.commonName)
	}
	for _, n := range s.dnsNames {
		if !slices.Contains(out, n) {
			out = append(out, n)
		}
	}
	return out
}

// newCSR is a CSR on an RSA-2048 key, signed with SHA-256.
func newCSR(t *testing.T, commonName string, dnsNames ...string) []byte {
	t.Helper()
	return buildCSR(t, csrSpec{keyType: "RSA-2048", hash: crypto.SHA256, commonName: commonName, dnsNames: dnsNames})
}

func buildCSR(t *testing.T, s csrSpec) []byte {
	t.Helper()
	var key crypto.Signer
	var err error
	switch s.keyType {
	case "RSA-2048":
		key, err = rsa.GenerateKey(rand.Reader, 2048)
	case "RSA-3072":
		key, err = rsa.GenerateKey(rand.Reader, 3072)
	case "RSA-4096":
		key, err = rsa.GenerateKey(rand.Reader, 4096)
	case "ECDSA-P256":
		key, err = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case "ECDSA-P384":
		key, err = ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	case "ECDSA-P521":
		key, err = ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	default:
		t.Fatalf("unknown key type %s", s.keyType)
	}
	require.NoError(t, err)

	tmpl := &x509.CertificateRequest{
		Subject:            pkix.Name{CommonName: s.commonName},
		DNSNames:           s.dnsNames,
		SignatureAlgorithm: signatureAlgorithm(t, key, s.hash),
	}
	if s.emptySANs {
		tmpl.ExtraExtensions = []pkix.Extension{emptySANExtension()}
	}
	der, err := x509.CreateCertificateRequest(rand.Reader, tmpl, key)
	require.NoError(t, err)
	return der
}

func signatureAlgorithm(t *testing.T, key crypto.Signer, hash crypto.Hash) x509.SignatureAlgorithm {
	t.Helper()
	_, isRSA := key.Public().(*rsa.PublicKey)
	switch {
	case isRSA && hash == crypto.SHA256:
		return x509.SHA256WithRSA
	case isRSA && hash == crypto.SHA384:
		return x509.SHA384WithRSA
	case isRSA && hash == crypto.SHA512:
		return x509.SHA512WithRSA
	case hash == crypto.SHA256:
		return x509.ECDSAWithSHA256
	case hash == crypto.SHA384:
		return x509.ECDSAWithSHA384
	case hash == crypto.SHA512:
		return x509.ECDSAWithSHA512
	}
	t.Fatalf("no signature algorithm for %v", hash)
	return x509.UnknownSignatureAlgorithm
}

// emptySANExtension is a subjectAltName extension holding no names, which some
// clients send when a certificate has none.
func emptySANExtension() pkix.Extension {
	return pkix.Extension{Id: []int{2, 5, 29, 17}, Value: []byte{0x30, 0x00}}
}

// pollACME is how often a status is read back. Once a second, as an ACME client
// would: every read is a signed request on the tenant's rate-limit budget.
var pollACME = wait.Interval(time.Second)
