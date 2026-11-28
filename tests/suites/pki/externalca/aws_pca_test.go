package externalca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func awsPcaCABody(proj *pki.Project, conn *fixture.AppConnection, name, arn string) api.CreateAwsPcaCertificateAuthorityV1JSONRequestBody {
	body := api.CreateAwsPcaCertificateAuthorityV1JSONRequestBody{
		ProjectId: &proj.ID,
		Name:      name,
		Status:    api.CreateAwsPcaCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.CertificateAuthorityArn = arn
	body.Configuration.Region = api.CreateAwsPcaCertificateAuthorityV1JSONBodyConfigurationRegionUsEast1
	return body
}

func TestAwsPcaCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate the Private CA signed with its own key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newPcaRig(t, tn)
		name := id.Short() + ".pca.test"

		// Action
		got := r.o.Settled(t, r.o.order(t, pki.ServerCertificate(name)).JSON200.CertificateRequestId)

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.Equal(t, []string{name}, leaf.DNSNames)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, r.Acct.ACMPCA.State(t).Authorities[r.ARN].Certificate)))
	})

	t.Run("should issue the certificate only once the Private CA stops reporting it in progress", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The fake reports the certificate in progress until the test releases it, so the
			request is seen pending while Infisical polls GetCertificate. The first wait is
			orderWait because external CA issuance is serialized across the instance.`)

		// Setup
		tn := h.NewTenant(t)
		r := newPcaRig(t, tn)
		r.Acct.Seed(t, aws.HoldPrivateCertificates())
		requestID := r.o.order(t, pki.ServerCertificate(id.Short()+".pca.test")).JSON200.CertificateRequestId
		r.Acct.ACMPCA.ExpectEvent[aws.PrivateCertificateFetched](t, func(e aws.PrivateCertificateFetched) bool {
			return e.CertificateAuthorityArn == r.ARN && e.InProgress
		}, fakenet.Within(orderWait))
		held := r.o.Settled(t, requestID, api.GetCertificateRequest200JSONResponseBodyStatusPending)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPending, held.JSON200.Status)
		require.Nil(t, held.JSON200.Certificate)

		// Action
		r.Acct.Seed(t, aws.ReleasePrivateCertificates())

		// Assert
		got := r.o.Settled(t, requestID)
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		issued := r.Acct.ACMPCA.State(t).Authorities[r.ARN].Issued
		require.Len(t, issued, 1)
		for _, held := range issued {
			require.Equal(t, held.Serial, leaf.SerialNumber.Text(16))
			require.Equal(t, pki.ParseLeaf(t, held.Certificate).Raw, leaf.Raw)
		}
	})

	t.Run("should refuse to create the CA when the Private CA is not active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		arn := aws.PrivateCAARN(conn.Nonce())
		acct.Seed(t, aws.SeedPrivateCA(arn, "DISABLED"))
		name := "pca-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateAwsPcaCertificateAuthorityV1WithResponse(t.Context(), awsPcaCABody(proj, conn, name, arn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "AWS Private CA '"+arn+"' is not ACTIVE (current status: DISABLED)", apierr.Message(res.Body))
		acct.Seed(t, aws.SeedPrivateCA(arn, "ACTIVE"))
		again, err := tn.Admin.API.CreateAwsPcaCertificateAuthorityV1WithResponse(t.Context(), awsPcaCABody(proj, conn, name, arn))
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, again.StatusCode(), "the refused create should have stored no CA under its name: %s", apierr.Body(again.Body))
	})

	t.Run("should refuse to create the CA when AWS has no Private CA with that ARN, naming the ARN and region", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		arn := aws.PrivateCAARN(conn.Nonce())

		// Action
		res, err := tn.Admin.API.CreateAwsPcaCertificateAuthorityV1WithResponse(t.Context(), awsPcaCABody(proj, conn, "pca-"+id.Short(), arn))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "AWS Private CA has no certificate authority '"+arn+"' in region 'us-east-1'. Check the ARN and the region.", apierr.Message(res.Body))
	})
}

func TestAwsPcaCA_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give a certificate ordered without an application its profile's auto-renewal window", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The Private CA passes no profile when it works out the window
			(calculateFinalRenewBeforeDays(undefined, ...) in aws-pca-certificate-authority-fns.ts),
			so it is never set; an order through an application is covered by the issuance queue.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		pca := pki.NewAwsPcaCA(t, proj)
		profile := pki.NewAutoRenewingProfile(t, proj, pca.CA, pki.NewPolicy(t, proj, pki.AllowAll(t)), 10)

		// Action
		certID := orderWithoutApplication(t, tn, profile, pki.ServerCertificate(id.Short()+".pca.test"))

		// Assert
		require.Equal(t, new(float32(10)), pki.ReadCertificate(t, tn.Admin, certID).JSON200.Certificate.RenewBeforeDays)
	})
}
