package scheduled_test

import (
	"encoding/base64"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSignerAutoRenewalJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should renew a signer inside its renew-before window onto a new key and leave one outside it", func(t *testing.T) {
		spec.Why(t, `The Private CA issues the due signer's certificate for 5 days against a 20-day
			renew-before window, so it is due as soon as it is issued; the control gets the 30 days
			it asks for.`)

		// Setup
		avoidScheduledFire(t, signerRenewalFire)
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		pca := pki.NewAwsPcaCA(t, proj)
		operator := tn.NewUser(t, harness.WithName("operator"))
		proj.Grant(t, operator)
		pca.Acct.Seed(t, aws.ShortLivedNextPrivateCertificate(5))
		due := renewingSigner(t, tn, proj, pca.CA, operator)
		kept := renewingSigner(t, tn, proj, pca.CA, operator)
		before := pki.SignerState(t, tn, due.ID).JSON200
		beforeLeaf := pki.SignerCertificate(t, tn, due.ID)
		keptBefore := pki.SignerState(t, tn, kept.ID).JSON200
		require.Less(t, time.Until(*before.CertificateNotAfter), 20*24*time.Hour, "the signer should be due before the job runs")

		// Action
		runJob(t, h, api.SignerDailyAutoRenewal)

		// Assert
		after := pki.PollSigner(t, tn.Admin, due.ID, func(res *api.GetSignerByIdResponse) bool {
			serial, status := res.JSON200.CertificateSerialNumber, res.JSON200.Status
			renewed := serial != nil && *serial != *before.CertificateSerialNumber && status != nil && *status != "pending"
			return renewed || res.JSON200.CertificateFailureReason != nil
		}).JSON200
		// A failed attempt is retried no sooner than 15 minutes later, well past the poll.
		if reason := after.CertificateFailureReason; reason != nil {
			require.Failf(t, "the renewal failed", "%s", *reason)
		}
		require.Equal(t, "active", *after.Status)
		require.True(t, after.CertificateNotAfter.After(*before.CertificateNotAfter), "renewed notAfter %s, original %s", after.CertificateNotAfter, before.CertificateNotAfter)
		leaf := pki.SignerCertificate(t, tn, due.ID)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, pca.Acct.ACMPCA.State(t).Authorities[pca.ARN].Certificate)))
		pki.RequireSigns(t, leaf, operator, due.ID)
		pub, err := tn.Admin.API.GetSignerPublicKeyWithResponse(t.Context(), due.ID)
		require.NoError(t, err)
		require.NotNilf(t, pub.JSON200, "reading the public key returned %d: %s", pub.StatusCode(), apierr.Body(pub.Body))
		der, err := base64.StdEncoding.DecodeString(pub.JSON200.PublicKey)
		require.NoError(t, err)
		require.Equal(t, leaf.RawSubjectPublicKeyInfo, der)
		require.NotEqual(t, beforeLeaf.RawSubjectPublicKeyInfo, leaf.RawSubjectPublicKeyInfo, "the renewal kept the original key")
		keptAfter := pki.SignerState(t, tn, kept.ID).JSON200
		require.Equal(t, *keptBefore.CertificateSerialNumber, *keptAfter.CertificateSerialNumber)
		require.Equal(t, keptBefore.CertificateRequest, keptAfter.CertificateRequest, "the job started a renewal for the signer outside its window")
		require.Equal(t, keptBefore.CertificateFailureReason, keptAfter.CertificateFailureReason, "the job started a renewal for the signer outside its window")
	})
}

// renewingSigner is an active signer issued by ca, with operator as its operator, that
// renews 20 days before its certificate expires.
func renewingSigner(t *testing.T, tn *harness.Tenant, proj *pki.Project, ca pki.CA, operator *harness.Principal) pki.Signer {
	t.Helper()
	s := pki.NewSigner(t, proj, pki.IssuedBy(ca), pki.SignerMember(operator, "operator"))
	res, err := tn.Admin.API.UpdateSignerWithResponse(t.Context(), s.ID, api.UpdateSignerJSONRequestBody{CertificateRenewBeforeDays: new(20)})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "setting the renewal lead time returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return s
}
