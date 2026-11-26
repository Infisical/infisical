package scheduled_test

import (
	"crypto/x509"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func currentCRL(t *testing.T, tn *harness.Tenant, ca pki.CA) *x509.RevocationList {
	t.Helper()
	return pki.ParseCRL(t, pki.CurrentCRL(t, tn.Admin.API, ca))
}

func TestCrlRotationJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should publish a new CRL that still lists a certificate revoked just before the run", func(t *testing.T) {
		spec.Why(t, `A CRL is due again while a revocation is within 5 minutes of its thisUpdate, so a
			revocation that raced the build is caught. Other due rules wait on the CRL's validity.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".crl.test"))
		pki.Revoke(t, tn.Admin, cert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		before := currentCRL(t, tn, g.CA)

		// Action
		runJob(t, h, api.CaCrlRotation)

		// Assert
		after := currentCRL(t, tn, g.CA)
		require.Equal(t, 1, after.Number.Cmp(before.Number), "the CRL number did not go up: %s then %s", before.Number, after.Number)
		require.Len(t, after.RevokedCertificateEntries, 1)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).SerialNumber, after.RevokedCertificateEntries[0].SerialNumber)
	})

	t.Run("should keep the CRL of a CA with nothing revoked and time left on it", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		ca := pki.NewInternalCA(t, pki.CertManager(t, tn))
		before := currentCRL(t, tn, ca)

		// Action
		runJob(t, h, api.CaCrlRotation)

		// Assert
		require.Equal(t, before.Number, currentCRL(t, tn, ca).Number)
	})
}
