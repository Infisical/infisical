package externalca_test

import (
	"crypto"
	"crypto/x509"
	"encoding/pem"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
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
		r := newAcmRig(t, tn)

		// Action
		got := r.o.Settled(t, r.o.order(t, r.request("www."+r.zoneName)).JSON200.CertificateRequestId)

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		requested := r.onlyCertificate(t)
		records := r.acct.Route53.State(t).Zones[r.zone].Records
		require.Len(t, records, 1)
		require.Equal(t, aws.RecordSet{Name: requested.Validation[0].Name, Type: "CNAME", TTL: 300, Values: []string{requested.Validation[0].Value}}, *records[0])

		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, pki.ParseLeaf(t, requested.Certificate).Raw, leaf.Raw)
		certID, err := uuid.Parse(*got.JSON200.CertificateId)
		require.NoError(t, err)
		key, err := r.o.Operator.API.GetCertificatePrivateKeyWithResponse(t.Context(), certID)
		require.NoError(t, err)
		block, _ := pem.Decode(key.Body)
		require.NotNilf(t, block, "the private key is not PEM: %s", apierr.Body(key.Body))
		parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		require.NoError(t, err)
		require.True(t, leaf.PublicKey.(interface{ Equal(crypto.PublicKey) bool }).Equal(parsed.(crypto.Signer).Public()))
	})
}
