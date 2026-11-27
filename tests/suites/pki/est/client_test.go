package est_test

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/smallstep/pkcs7"
	"github.com/stretchr/testify/require"
)

const passphrase = "est-passphrase-123"

// estProfile is an application profile with EST enrollment on, reached by an
// unauthenticated client the way a device reaches it.
type estProfile struct {
	*pki.ApplicationGraph
	client *api.ClientWithResponses
}

// newEstProfile turns EST on for a new application graph's profile. Bootstrap CA
// validation is off unless the body turns it on.
func newEstProfile(t *testing.T, tn *harness.Tenant, body api.SetPkiApplicationEstEnrollmentJSONRequestBody, policy api.CreateCertificatePolicyJSONRequestBody) estProfile {
	t.Helper()
	return enableEst(t, tn, pki.NewApplicationGraph(t, tn, policy), body)
}

func enableEst(t *testing.T, tn *harness.Tenant, g *pki.ApplicationGraph, body api.SetPkiApplicationEstEnrollmentJSONRequestBody) estProfile {
	t.Helper()
	if body.Passphrase == "" {
		body.Passphrase = passphrase
	}
	if body.DisableBootstrapCaValidation == nil && body.CaChain == nil {
		body.DisableBootstrapCaValidation = new(true)
	}
	res, err := tn.Admin.API.SetPkiApplicationEstEnrollmentWithResponse(t.Context(), g.App.ID, g.Profile.ID, body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "enabling EST: %s", apierr.Body(res.Body))
	return estProfile{ApplicationGraph: g, client: tn.Anonymous(t)}
}

// newEcdsaEstProfile is an EST profile issuing straight from a root CA on an ECDSA
// P-256 key.
func newEcdsaEstProfile(t *testing.T, tn *harness.Tenant) estProfile {
	t.Helper()
	p := pki.CertManager(t, tn)
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "ca-" + id.Short(),
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECPrime256v1
	body.Configuration.Organization = new("Infisical Harness")
	body.Configuration.NotAfter = new(time.Now().AddDate(10, 0, 0).UTC().Format(time.RFC3339))
	res, err := tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the ECDSA CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ca := pki.CA{ID: res.JSON200.Id}
	policy := pki.NewPolicy(t, p, pki.AllowAll(t))
	profile := pki.NewProfile(t, p, ca, policy)
	app := pki.NewApplication(t, p, profile)
	g := &pki.ApplicationGraph{Project: p, Root: ca, CA: ca, Policy: policy, Profile: profile, App: app}
	return enableEst(t, tn, g, api.SetPkiApplicationEstEnrollmentJSONRequestBody{})
}

type enrollOpts struct {
	passphrase string
	clientCert *x509.Certificate
}

func (o enrollOpts) editor(_ context.Context, r *http.Request) error {
	pass := o.passphrase
	if pass == "" {
		pass = passphrase
	}
	r.SetBasicAuth("device", pass)
	if o.clientCert != nil {
		r.Header.Set("x-ssl-client-cert", url.PathEscape(string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: o.clientCert.Raw}))))
	}
	return nil
}

func (p estProfile) enroll(t *testing.T, csr []byte, o enrollOpts) *api.PostEstApplicationSimpleEnrollResponse {
	t.Helper()
	return p.enrollBody(t, "application/pkcs10", csrPEM(csr), o)
}

// enrollBody sends simpleenroll a body as given, for the encodings and media types
// a device may send instead of a PEM CSR.
func (p estProfile) enrollBody(t *testing.T, contentType, body string, o enrollOpts) *api.PostEstApplicationSimpleEnrollResponse {
	t.Helper()
	res, err := p.client.PostEstApplicationSimpleEnrollWithBodyWithResponse(t.Context(), p.App.ID, p.Profile.ID, contentType, strings.NewReader(body), o.editor)
	require.NoError(t, err)
	return res
}

func (p estProfile) reenroll(t *testing.T, csr []byte, o enrollOpts) *api.PostEstApplicationSimpleReenrollResponse {
	t.Helper()
	res, err := p.client.PostEstApplicationSimpleReenrollWithBodyWithResponse(t.Context(), p.App.ID, p.Profile.ID, "application/pkcs10", strings.NewReader(csrPEM(csr)), o.editor)
	require.NoError(t, err)
	return res
}

// mustEnroll enrolls a CSR for name and returns the issued leaf.
func (p estProfile) mustEnroll(t *testing.T, key crypto.Signer, name string) *x509.Certificate {
	t.Helper()
	res := p.enroll(t, newCSR(t, key, name), enrollOpts{})
	require.Equalf(t, http.StatusOK, res.StatusCode(), "enrolling: %s", apierr.Body(res.Body))
	return certsOf(t, res.Body)[0]
}

func newKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return k
}

func newEcdsaKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	return k
}

// newCSR is a CSR for one name, as both common name and DNS SAN.
func newCSR(t *testing.T, key crypto.Signer, name string) []byte {
	t.Helper()
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject:  pkix.Name{CommonName: name},
		DNSNames: []string{name},
	}, key)
	require.NoError(t, err)
	return der
}

func csrPEM(der []byte) string {
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der}))
}

// certsOf reads the certificates out of a base64 certs-only PKCS#7 reply.
func certsOf(t *testing.T, body []byte) []*x509.Certificate {
	t.Helper()
	der, err := base64.StdEncoding.DecodeString(strings.Join(strings.Fields(string(body)), ""))
	require.NoErrorf(t, err, "the reply is not base64: %q", body)
	p7, err := pkcs7.Parse(der)
	require.NoError(t, err)
	require.NotEmpty(t, p7.Certificates)
	return p7.Certificates
}

// selfSignedCA is a CA of the test's own, outside anything Infisical holds.
func selfSignedCA(t *testing.T) (*x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	key := newKey(t)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Outside CA"},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(24 * time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	c, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return c, key
}

// leafFrom is a client certificate for name that ca signed.
func leafFrom(t *testing.T, ca *x509.Certificate, caKey *rsa.PrivateKey, key *rsa.PrivateKey, name string) *x509.Certificate {
	t.Helper()
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(24 * time.Hour),
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca, &key.PublicKey, caKey)
	require.NoError(t, err)
	c, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return c
}

func certPEM(c *x509.Certificate) string {
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw}))
}
