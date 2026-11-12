package scep_test

import (
	"crypto/x509"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/smallstep/scep"
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
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		req := p.pkcsReq(t, newDevice(t, "strict.example.com"), "strict.example.com", "testpassword123")
		certRep := p.post(t, req.msg.Raw)

		// Action
		_, err := scep.ParsePKIMessage(certRep, scep.WithCACerts([]*x509.Certificate{req.ra}))

		// Assert
		require.NoError(t, err)
	})
}
