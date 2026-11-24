package signers_test

import (
	"crypto/x509"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// upstreamWait bounds a signer's certificate request to an external CA.
const upstreamWait = 2 * time.Minute

func TestSigner_ExternalCA(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should activate a signer whose code signing certificate the AWS Private CA issued", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `External CAs issue on a queue the whole instance shares, so a signer request
			waits behind other tests' orders.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		pca := pki.NewAwsPcaCA(t, proj)

		// Action
		s, status, reason := createSignerWaiting(t, proj, pki.IssuedBy(pca.CA))

		// Assert
		require.Equalf(t, "active", status, "reason: %s", reason)
		pca.Acct.ACMPCA.ExpectEvent[aws.PrivateCertificateIssued](t, func(e aws.PrivateCertificateIssued) bool {
			return e.CertificateAuthorityArn == pca.ARN
		})
		leaf := certificateOf(t, tn, s.ID)
		require.Contains(t, leaf.ExtKeyUsage, x509.ExtKeyUsageCodeSigning)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, pca.Acct.ACMPCA.State(t).Authorities[pca.ARN].Certificate)))
	})

	t.Run("should fail a signer whose Azure AD CS certificate lacks the code signing usage", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A signer only signs code, so Infisical checks the certificate an external CA
			returns and refuses one without the codeSigning extended key usage.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		// Infisical orders signer certificates under AD CS's default template, and the fake
		// refuses a template it has not published.
		adcs.Seed(t, azureadcs.WithTemplates("WebServer"))

		// Action
		_, status, reason := createSignerWaiting(t, proj, pki.IssuedBy(ca))

		// Assert
		require.Equal(t, "failed", status)
		require.Equal(t, "The issued certificate does not have the codeSigning extended key usage set.", reason)
		adcs.ExpectEvent[azureadcs.CertificateIssued](t, nil)
	})
}

// createSignerWaiting creates a signer and waits for its external certificate request
// within upstreamWait.
func createSignerWaiting(t *testing.T, proj *pki.Project, opts ...pki.SignerOption) (pki.Signer, string, string) {
	t.Helper()
	return pki.CreateSigner(t, proj, append(opts, pki.WaitingUpTo(wait.Timeout(upstreamWait)))...)
}
