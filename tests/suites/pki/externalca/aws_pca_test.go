package externalca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
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
}
