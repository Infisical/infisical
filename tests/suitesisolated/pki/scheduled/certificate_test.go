package scheduled_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCertificateAutoRenewalJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should renew a certificate inside its renew-before window once and leave one outside it", func(t *testing.T) {
		spec.Why(t, `ACM issues the due certificate for 5 days under a profile that renews 30 days
			before expiry, so it is due as soon as it issues; the control gets ACM's usual 198 days.`)

		// Setup
		avoidScheduledFire(t, certificateRenewalFire)
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		acm := pki.NewAwsAcmPublicCA(t, proj)
		profile := pki.NewAutoRenewingProfile(t, proj, acm.CA, pki.NewPolicy(t, proj, pki.AllowAll(t)), 30)
		o := orderer{pki.NewOrderer(t, proj, profile)}
		acm.Acct.Seed(t, aws.ShortLivedNextACMCertificate(5))
		due := o.issued(t, pki.AcmCertificate("due."+acm.ZoneName))
		kept := o.issued(t, pki.AcmCertificate("kept."+acm.ZoneName))
		original := pki.ReadCertificate(t, o.Operator, due).JSON200.Certificate
		require.Less(t, time.Until(original.NotAfter), 30*24*time.Hour, "the certificate should be due before the job runs")
		require.Nil(t, original.RenewedByCertificateId)

		// Action
		runJob(t, h, api.CertificateV3AutoRenewal)

		// Assert
		renewedID, res := renewedBy(t, o.Operator, due)
		renewed := res.JSON200.Certificate
		require.Equal(t, original.CommonName, renewed.CommonName)
		require.Equal(t, original.AltNames, renewed.AltNames)
		require.Equal(t, profile.ID, *renewed.ProfileId)
		require.True(t, renewed.NotAfter.After(original.NotAfter), "renewed notAfter %s, original %s", renewed.NotAfter, original.NotAfter)
		require.Equal(t, pki.ParseLeaf(t, acmCertificateFor(t, acm.Acct, "due."+acm.ZoneName).Certificate).Raw, pki.ParseLeaf(t, bundleOf(t, o.Operator, renewedID)).Raw)
		audited := fixture.WaitForAuditEvents(t, tn, "automated-renew-certificate", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["certificateId"] == due.String()
		})
		require.Equal(t, "platform", audited[0].ActorType)
		control := pki.ReadCertificate(t, o.Operator, kept).JSON200.Certificate
		require.Equal(t, "active", control.Status)
		require.Nil(t, control.RenewedByCertificateId)

		runJob(t, h, api.CertificateV3AutoRenewal)
		require.Equal(t, 3, pki.Requests(t, proj, profile), "a second run should order no renewal: two orders and one renewal")
		require.Equal(t, 1, acmCertificateFor(t, acm.Acct, "due."+acm.ZoneName).Renewals)
		require.Equal(t, 0, acmCertificateFor(t, acm.Acct, "kept."+acm.ZoneName).Renewals)
	})

	t.Run("should leave a certificate whose renew-before window has not opened", func(t *testing.T) {
		spec.Why(t, `The window cannot be opened through the API: setting it refuses a renewal date
			before tomorrow, and the job renews only certificates whose date is today or earlier.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".renewal.test"))
		res, err := g.Operator.API.UpdateCertificateRenewalConfigWithResponse(t.Context(), issued.ID, api.UpdateCertificateRenewalConfigJSONRequestBody{
			EnableAutoRenewal: new(true),
			RenewBeforeDays:   new(7),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "turning auto-renewal on returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Action
		runJob(t, h, api.CertificateV3AutoRenewal)

		// Assert
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.Nil(t, got.RenewedByCertificateId)
		require.Equal(t, "active", got.Status)
	})

	t.Run("should leave a certificate with auto-renewal off", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".renewal.test"))

		// Action
		runJob(t, h, api.CertificateV3AutoRenewal)

		// Assert
		got := pki.ReadCertificate(t, g.Operator, issued.ID).JSON200.Certificate
		require.Nil(t, got.RenewBeforeDays)
		require.Nil(t, got.RenewedByCertificateId)
		require.Equal(t, "active", got.Status)
	})
}

// renewedBy waits for a certificate to be renewed and returns the certificate that
// replaced it, once `as` can read it. An external CA's renewal is linked before it is
// attached to the application, so an application member is refused it at first.
func renewedBy(t *testing.T, as *harness.Principal, certID uuid.UUID) (uuid.UUID, *api.GetCertificateResponse) {
	t.Helper()
	res := pki.Poll(t, "reading the certificate", func(ctx context.Context) (*api.GetCertificateResponse, int, []byte, error) {
		res, status, body, err := pki.ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return as.API.GetCertificate(ctx, certID, nil)
		}, api.ParseGetCertificateResponse)
		if err == nil && status == http.StatusOK && res.JSON200 == nil {
			err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
		}
		return res, status, body, err
	}, func(res *api.GetCertificateResponse) bool {
		return res.JSON200.Certificate.RenewedByCertificateId != nil
	})
	renewedID := *res.JSON200.Certificate.RenewedByCertificateId
	renewed, err := wait.For(t.Context(), func(ctx context.Context) (*api.GetCertificateResponse, bool, error) {
		res, err := as.API.GetCertificateWithResponse(ctx, renewedID, nil)
		if err != nil {
			return nil, false, err
		}
		if res.JSON200 == nil {
			return nil, false, fmt.Errorf("reading the renewed certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		}
		return res, true, nil
	})
	require.NoError(t, err, "waiting for the renewed certificate to be readable")
	return renewedID, renewed
}

// bundleOf is the PEM body of a certificate as `as` reads it.
func bundleOf(t *testing.T, as *harness.Principal, certID uuid.UUID) string {
	t.Helper()
	res, err := as.API.GetCertificateBundleWithResponse(t.Context(), certID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the certificate bundle returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Certificate
}

// acmCertificateFor is the certificate ACM holds for a domain.
func acmCertificateFor(t *testing.T, acct *aws.ControlPlane, domain string) *aws.ACMCertificate {
	t.Helper()
	for _, c := range acct.Certificates(t) {
		if c.DomainName == domain {
			return c
		}
	}
	require.FailNow(t, "ACM holds no certificate for "+domain)
	return nil
}
