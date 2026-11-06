package scep_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/smallstep/scep"
	"github.com/smallstep/scep/x509util"
	"github.com/stretchr/testify/require"
)

func TestScepCertRep_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should sign a CertRep that a strict CMS verifier accepts", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `RFC 5652 5.4 signs the DER encoding of the signed attributes, so a SET OF sorted
			by encoding. Infisical signs them in insertion order (pki-scep-message-builder.ts), which
			OpenSSL-based clients such as sscep tolerate and Go's pkcs7, used by step-ca and micromdm
			clients, rejects with a signature error.`)

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")
		ra := p.caCerts(t)[0]
		signer := newDevice(t, "strict.example.com")
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)
		der, err := x509util.CreateCertificateRequest(rand.Reader, &x509util.CertificateRequest{
			CertificateRequest: x509.CertificateRequest{Subject: pkix.Name{CommonName: "strict.example.com"}},
			ChallengePassword:  "testpassword123",
		}, key)
		require.NoError(t, err)
		csr, err := x509.ParseCertificateRequest(der)
		require.NoError(t, err)
		msg, err := scep.NewCSRRequest(csr, &scep.PKIMessage{MessageType: scep.PKCSReq, Recipients: []*x509.Certificate{ra}, SignerKey: signer.key, SignerCert: signer.cert})
		require.NoError(t, err)
		res := p.operation(t, "PKIOperation", msg.Raw)
		require.Equal(t, http.StatusOK, res.StatusCode())

		// Action
		_, err = scep.ParsePKIMessage(res.Body, scep.WithCACerts([]*x509.Certificate{ra}))

		// Assert
		require.NoError(t, err)
	})
}
