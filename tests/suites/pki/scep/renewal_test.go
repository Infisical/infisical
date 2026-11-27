package scep_test

import (
	"crypto/rsa"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew without a challenge password when the request is signed by the issued certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		issued := p.mustEnroll(t, "renew-device.example.com", "testpassword123")

		// Action
		got, _ := p.enroll(t, issued, "renew-device.example.com", "")

		// Assert
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "renew-device.example.com", got.cert.Subject.CommonName)
		require.NotEqual(t, issued.cert.SerialNumber, got.cert.SerialNumber)
	})

	t.Run("should refuse the renewal when certificate-based renewal is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, withoutRenewal(staticChallenge("testpassword123")))
		issued := p.mustEnroll(t, "deny-device.example.com", "testpassword123")

		// Action
		got, _ := p.enroll(t, issued, "deny-device.example.com", "")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
	})

	t.Run("should renew when a RenewalReq is signed by the issued certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		issued := p.mustEnroll(t, "renewalreq-device.example.com", "testpassword123")

		// Action
		got, key := p.renew(t, issued, "renewalreq-device.example.com")

		// Assert
		require.Equalf(t, scep.SUCCESS, got.status, "renewal failed: %s", got.failInfo)
		require.True(t, key.PublicKey.Equal(got.cert.PublicKey), "the certificate is not for the renewal CSR's key")
		require.NotEqual(t, issued.cert.SerialNumber, got.cert.SerialNumber)
	})

	t.Run("should refuse a RenewalReq signed by a revoked certificate with badCertId and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		issued := p.mustEnroll(t, "revoked-device.example.com", "testpassword123")
		certID, ok := p.certificates(t)[serial(issued.cert)]
		require.True(t, ok, "the enrolled certificate is not on the profile")
		pki.Revoke(t, tn.Admin, pki.Certificate{ID: certID}, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		before := p.certificates(t)

		// Action
		got, _ := p.renew(t, issued, "revoked-device.example.com")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadCertID, got.failInfo)
		require.Equal(t, before, p.certificates(t))
	})
}

// renew sends a RenewalReq signed by an enrolled device for a CSR naming commonName on a
// fresh key, and reads the CertRep it gets back.
func (p scepProfile) renew(t *testing.T, signer device, commonName string) (enrollment, *rsa.PrivateKey) {
	t.Helper()
	req := p.csrRequest(t, scep.RenewalReq, signer, commonName, "")
	return readCertRep(t, p.post(t, req.msg.Raw), req, signer), req.key
}
