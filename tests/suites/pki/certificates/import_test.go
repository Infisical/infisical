package certificates_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// outsideCertificate is a leaf for name, its key and its issuing root, all made
// outside Infisical, as PEM.
func outsideCertificate(t *testing.T, name string) (leafPEM, keyPEM, chainPEM string) {
	t.Helper()
	rootKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	root := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Outside Root " + id.Short()},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(1, 0, 0),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	rootDER, err := x509.CreateCertificate(rand.Reader, root, root, &rootKey.PublicKey, rootKey)
	require.NoError(t, err)
	root, err = x509.ParseCertificate(rootDER)
	require.NoError(t, err)

	leafKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	leafDER, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(0, 1, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}, root, &leafKey.PublicKey, rootKey)
	require.NoError(t, err)
	keyDER, err := x509.MarshalPKCS8PrivateKey(leafKey)
	require.NoError(t, err)

	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: leafDER})),
		string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})),
		string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: rootDER}))
}

func TestCertificate_Import(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep a certificate issued outside Infisical in the application as imported and readable with its key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".imported.test"
		leaf, key, chain := outsideCertificate(t, name)

		// Action
		res, err := g.Operator.API.ImportCertificateWithResponse(t.Context(), api.ImportCertificateJSONRequestBody{
			ApplicationId:  &g.App.ID,
			CertificatePem: leaf,
			PrivateKeyPem:  &key,
			ChainPem:       &chain,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "importing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := pki.ReadCertificate(t, g.Operator, res.JSON200.CertificateId).JSON200.Certificate
		require.Equal(t, new("imported"), got.Source)
		require.Equal(t, name, got.CommonName)
		require.True(t, got.HasPrivateKey)
		bundle, err := g.Operator.API.GetCertificateBundleWithResponse(t.Context(), res.JSON200.CertificateId)
		require.NoError(t, err)
		require.NotNilf(t, bundle.JSON200, "reading the bundle returned %d: %s", bundle.StatusCode(), apierr.Body(bundle.Body))
		require.Equal(t, pki.ParseLeaf(t, leaf).Raw, pki.ParseLeaf(t, bundle.JSON200.Certificate).Raw)
		require.NotNil(t, bundle.JSON200.CertificateChain)
		require.Equal(t, pki.ParseLeaf(t, chain).Raw, pki.ParseLeaf(t, *bundle.JSON200.CertificateChain).Raw)
		require.NotNil(t, bundle.JSON200.PrivateKey)
		require.True(t, publicKeyOf(t, key).Equal(publicKeyOf(t, *bundle.JSON200.PrivateKey)), "the bundle's private key is not the imported one")
	})
}
