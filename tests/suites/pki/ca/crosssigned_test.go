package ca_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// legacyRoot is a CA outside Infisical that cross-signs one of its CAs.
type legacyRoot struct {
	key  *ecdsa.PrivateKey
	cert *x509.Certificate
	pem  string
}

func newLegacyRoot(t *testing.T) legacyRoot {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Legacy Root CA G2", Organization: []string{"Acme"}},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().AddDate(1, 0, 0),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, key.Public(), key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return legacyRoot{key: key, cert: cert, pem: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))}
}

// crossSign signs a certificate for the CA's subject and key identifier over pub.
func (l legacyRoot) crossSign(t *testing.T, ca *x509.Certificate, pub any) string {
	t.Helper()
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(0x0a02),
		RawSubject:            ca.RawSubject,
		SubjectKeyId:          ca.SubjectKeyId,
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().AddDate(0, 0, 30),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, l.cert, pub, l.key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}

// importCrossSigned has a new legacy root cross-sign the CA's key and imports that copy
// with the legacy root as its chain. It returns the legacy root and the copy's PEM.
func importCrossSigned(t *testing.T, tn *harness.Tenant, ca pki.CA) (legacyRoot, string) {
	t.Helper()
	self := pki.CACertificate(t, tn.Admin, ca.ID)
	legacy := newLegacyRoot(t)
	copyPEM := legacy.crossSign(t, self, self.PublicKey)
	imp, err := tn.Admin.API.ImportCaCrossSignedCertificateWithResponse(t.Context(), ca.ID, api.ImportCaCrossSignedCertificateJSONRequestBody{
		Certificate:      copyPEM,
		CertificateChain: legacy.pem,
	})
	require.NoError(t, err)
	require.NotNilf(t, imp.JSON200, "importing returned %d: %s", imp.StatusCode(), apierr.Body(imp.Body))
	return legacy, copyPEM
}

// chainEnd is the last certificate of a PEM chain.
func chainEnd(t *testing.T, chain string) *x509.Certificate {
	t.Helper()
	var last *pem.Block
	for rest := []byte(chain); ; {
		block, next := pem.Decode(rest)
		if block == nil {
			break
		}
		last, rest = block, next
	}
	require.NotNil(t, last, "no certificate in the chain: %q", chain)
	cert, err := x509.ParseCertificate(last.Bytes)
	require.NoError(t, err)
	return cert
}

func TestInternalCA_CrossSignedCertificate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the cross-signed certificate and the old CA's chain as imported", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := pki.NewInternalCA(t, pki.CertManager(t, tn))
		legacy, copyPEM := importCrossSigned(t, tn, root)

		// Action
		res, err := tn.Admin.API.GetCaCrossSignedCertificateWithResponse(t.Context(), root.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := res.JSON200.CrossSignedCertificate
		require.NotNil(t, got)
		require.Equal(t, root.ID, got.CaId)
		require.Equal(t, pki.ParseLeaf(t, copyPEM).Raw, pki.ParseLeaf(t, got.Certificate).Raw)
		require.Equal(t, legacy.cert.Raw, pki.ParseLeaf(t, got.CertificateChain).Raw)
		require.Equal(t, "0a02", got.SerialNumber)
	})

	t.Run("should stop returning the cross-signed certificate once it is deleted, chain new certificates to the self-signed root and keep earlier chains", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		legacy, _ := importCrossSigned(t, tn, g.Root)
		before := g.Issue(t, pki.ServerCertificate(id.Short()+".cross.test"))
		require.Equal(t, legacy.cert.Raw, chainEnd(t, before.Chain).Raw, "issued before deletion without the cross-signed chain")

		// Action
		res, err := tn.Admin.API.DeleteCaCrossSignedCertificateWithResponse(t.Context(), g.Root.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting answered: %s", apierr.Body(res.Body))

		// Assert
		stored, err := tn.Admin.API.GetCaCrossSignedCertificateWithResponse(t.Context(), g.Root.ID)
		require.NoError(t, err)
		require.NotNilf(t, stored.JSON200, "reading returned %d: %s", stored.StatusCode(), apierr.Body(stored.Body))
		require.Nil(t, stored.JSON200.CrossSignedCertificate)
		after := g.Issue(t, pki.ServerCertificate(id.Short()+".cross.test"))
		require.Equal(t, pki.CACertificate(t, tn.Admin, g.Root.ID).Raw, chainEnd(t, after.Chain).Raw)
		bundle, err := tn.Admin.API.GetCertificateBundleWithResponse(t.Context(), before.ID)
		require.NoError(t, err)
		require.NotNilf(t, bundle.JSON200, "reading the earlier bundle returned %d: %s", bundle.StatusCode(), apierr.Body(bundle.Body))
		require.NotNil(t, bundle.JSON200.CertificateChain)
		require.Equal(t, before.Chain, *bundle.JSON200.CertificateChain)
	})

	t.Run("should refuse a cross-signed certificate for another key and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := pki.NewInternalCA(t, pki.CertManager(t, tn))
		self := pki.CACertificate(t, tn.Admin, root.ID)
		legacy := newLegacyRoot(t)
		other, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.ImportCaCrossSignedCertificateWithResponse(t.Context(), root.ID, api.ImportCaCrossSignedCertificateJSONRequestBody{
			Certificate:      legacy.crossSign(t, self, other.Public()),
			CertificateChain: legacy.pem,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This certificate's key doesn't match this CA. Have the old CA sign the CSR from this CA.", apierr.Message(res.Body))
		stored, err := tn.Admin.API.GetCaCrossSignedCertificateWithResponse(t.Context(), root.ID)
		require.NoError(t, err)
		require.NotNil(t, stored.JSON200)
		require.Nil(t, stored.JSON200.CrossSignedCertificate)
	})
}
