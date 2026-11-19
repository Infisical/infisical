package certificates_test

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func verifyChain(t *testing.T, leaf *x509.Certificate, chain string) {
	t.Helper()
	roots, inter := x509.NewCertPool(), x509.NewCertPool()
	rest := []byte(chain)
	n := 0
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		c, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		n++
		if c.Subject.String() == c.Issuer.String() {
			roots.AddCert(c)
		} else {
			inter.AddCert(c)
		}
	}
	require.Equal(t, 2, n, "the chain should hold the intermediate and the root")
	_, err := leaf.Verify(x509.VerifyOptions{Roots: roots, Intermediates: inter, KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}})
	require.NoError(t, err)
}

// newCSR is a PEM CSR on a fresh RSA-2048 key for a common name and DNS names. RSA
// because an RSA CA signs only RSA requests.
func newCSR(t *testing.T, commonName string, dnsNames ...string) (string, *rsa.PublicKey) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der, err := x509.CreateCertificateRequest(rand.Reader, &x509.CertificateRequest{
		Subject:            pkix.Name{CommonName: commonName},
		DNSNames:           dnsNames,
		SignatureAlgorithm: x509.SHA256WithRSA,
	}, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE REQUEST", Bytes: der})), &key.PublicKey
}

// csrRequest is a request that carries a CSR instead of attributes, still asking for
// serverAuth for 30 days, which the CSR itself does not say.
func csrRequest(csr string) api.CreateCertificateJSONRequestBody {
	body := pki.ServerCertificate("unused")
	body.Attributes.CommonName, body.Attributes.AltNames = nil, nil
	body.Attributes.KeyAlgorithm = nil
	body.Csr = &csr
	return body
}

func readCert(t *testing.T, as *harness.Principal, id uuid.UUID) *api.GetCertificateResponse {
	t.Helper()
	res, err := as.API.GetCertificateWithResponse(t.Context(), id, nil)
	require.NoError(t, err)
	return res
}

// withSAN replaces the request's DNS names.
func withSAN(body api.CreateCertificateJSONRequestBody, names ...string) api.CreateCertificateJSONRequestBody {
	alt := make([]struct {
		Type  api.CreateCertificateJSONBodyAttributesAltNamesType `json:"type"`
		Value string                                              `json:"value"`
	}, 0, len(names))
	for _, n := range names {
		alt = append(alt, struct {
			Type  api.CreateCertificateJSONBodyAttributesAltNamesType `json:"type"`
			Value string                                              `json:"value"`
		}{Type: api.CreateCertificateJSONBodyAttributesAltNamesTypeDnsName, Value: n})
	}
	body.Attributes.AltNames = &alt
	return body
}

func publicKeyOf(t *testing.T, privatePEM string) interface{ Equal(crypto.PublicKey) bool } {
	t.Helper()
	block, _ := pem.Decode([]byte(privatePEM))
	require.NotNil(t, block, "no private key PEM: %q", privatePEM)
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
	}
	require.NoError(t, err)
	return key.(crypto.Signer).Public().(interface{ Equal(crypto.PublicKey) bool })
}

const crossOrgWhy = `[BUG?] An unknown id answers 404 and another organization's id 403 naming the
	project, which tells a caller the id exists.`
