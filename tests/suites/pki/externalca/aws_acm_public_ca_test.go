package externalca_test

import (
	"crypto"
	"crypto/x509"
	"encoding/pem"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAwsAcmPublicCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue an exportable ACM certificate after writing its validation record in Route 53", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `ACM retries a pending validation on a fixed 60 second backoff, so the fake reports the
			certificate issued on the first status check. Its export refuses until the validation
			CNAME is in the zone, so the record has to be written before the certificate is fetched.
			The wait is orderWait because external CA issuance is serialized across the instance.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		zoneName := id.Short() + ".acm.test"
		zone := "Z" + id.Short()
		acct.Seed(t, aws.SeedHostedZone(zone, zoneName))
		body := api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONRequestBody{
			ProjectId: &proj.ID,
			Name:      "acm-" + id.Short(),
			Status:    api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONBodyStatusActive,
		}
		body.Configuration.AppConnectionId = conn.ID
		body.Configuration.DnsAppConnectionId = conn.ID
		body.Configuration.HostedZoneId = zone
		body.Configuration.Region = api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONBodyConfigurationRegionUsEast1
		res, err := tn.Admin.API.CreateAwsAcmPublicCaCertificateAuthorityV1WithResponse(t.Context(), body)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		issuer := newOrderIssuer(t, tn, proj, pki.CA{ID: res.JSON200.Id})
		name := "www." + zoneName
		order := pki.ServerCertificate(name)
		order.Attributes.Ttl = new("198d")

		// Action
		got := issuer.settled(t, issuer.order(t, order).JSON200.CertificateRequestId)

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		var requested *aws.ACMCertificate
		for _, c := range acct.Certificates(t) {
			requested = c
		}
		require.NotNil(t, requested, "ACM should hold the requested certificate")
		records := acct.Route53.State(t).Zones[zone].Records
		require.Len(t, records, 1)
		require.Equal(t, aws.RecordSet{Name: requested.Validation[0].Name, Type: "CNAME", TTL: 300, Values: []string{requested.Validation[0].Value}}, *records[0])

		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, pki.ParseLeaf(t, requested.Certificate).Raw, leaf.Raw)
		certID, err := uuid.Parse(*got.JSON200.CertificateId)
		require.NoError(t, err)
		key, err := issuer.operator.API.GetCertificatePrivateKeyWithResponse(t.Context(), certID)
		require.NoError(t, err)
		block, _ := pem.Decode(key.Body)
		require.NotNilf(t, block, "the private key is not PEM: %s", apierr.Body(key.Body))
		parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		require.NoError(t, err)
		require.True(t, leaf.PublicKey.(interface{ Equal(crypto.PublicKey) bool }).Equal(parsed.(crypto.Signer).Public()))
	})
}
