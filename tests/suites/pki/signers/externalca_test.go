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
		leaf := pki.SignerCertificate(t, tn, s.ID)
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

	t.Run("should activate a signer whose Azure AD CS template issues the code signing usage, and sign with it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Infisical always orders signer certificates under the WebServer template, so a
			code signing certificate comes back only when an AD CS admin has added codeSigning to it.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, adcs := pki.NewAzureADCSCA(t, proj)
		adcs.Seed(t, azureadcs.WithTemplateUsages("WebServer", x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageCodeSigning))
		operator := tn.NewUser(t, harness.WithName("operator"))
		proj.Grant(t, operator)

		// Action
		s, status, reason := createSignerWaiting(t, proj, pki.IssuedBy(ca), pki.SignerMember(operator, "operator"))

		// Assert
		require.Equalf(t, "active", status, "reason: %s", reason)
		adcs.ExpectEvent[azureadcs.CertificateIssued](t, func(e azureadcs.CertificateIssued) bool { return e.Template == "WebServer" })
		leaf := pki.SignerCertificate(t, tn, s.ID)
		require.Contains(t, leaf.ExtKeyUsage, x509.ExtKeyUsageCodeSigning)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, adcs.State(t).Root)))
		pki.RequireSigns(t, leaf, operator, s.ID)
	})
}

// createSignerWaiting creates a signer and waits for its external certificate request
// within upstreamWait.
func createSignerWaiting(t *testing.T, proj *pki.Project, opts ...pki.SignerOption) (pki.Signer, string, string) {
	t.Helper()
	return pki.CreateSigner(t, proj, append(opts, pki.WaitingUpTo(wait.Timeout(upstreamWait)))...)
}
