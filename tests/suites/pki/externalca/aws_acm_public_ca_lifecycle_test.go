package externalca_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

type acmRig struct {
	o        orderIssuer
	acct     *aws.ControlPlane
	conn     *fixture.AppConnection
	ca       pki.CA
	zone     string
	zoneName string
}

func newAcmRig(t *testing.T, tn *harness.Tenant) acmRig {
	t.Helper()
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
	ca := pki.CA{ID: res.JSON200.Id}
	return acmRig{o: newOrderIssuer(t, proj, ca), acct: acct, conn: conn, ca: ca, zone: zone, zoneName: zoneName}
}

func (r acmRig) request(name string) api.CreateCertificateJSONRequestBody {
	body := pki.ServerCertificate(name)
	body.Attributes.Ttl = new("198d")
	return body
}

// onlyCertificate is the one certificate ACM holds for the account.
func (r acmRig) onlyCertificate(t *testing.T) *aws.ACMCertificate {
	t.Helper()
	certs := r.acct.Certificates(t)
	require.Len(t, certs, 1)
	for _, c := range certs {
		return c
	}
	return nil
}

func TestAwsAcmPublicCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew the certificate in place under the same ARN", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The wait is orderWait because external CA issuance is serialized across the instance.")

		// Setup
		tn := h.NewTenant(t)
		r := newAcmRig(t, tn)
		certID, first := r.o.issue(t, r.request("www."+r.zoneName))
		issued := r.onlyCertificate(t)

		// Action
		got := r.o.Settled(t, r.o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		renewed := r.onlyCertificate(t)
		require.Equal(t, issued.ARN, renewed.ARN)
		require.Equal(t, 1, renewed.Renewals)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.NotEqual(t, pki.ParseLeaf(t, *first.JSON200.Certificate).SerialNumber, leaf.SerialNumber)
		require.Equal(t, pki.ParseLeaf(t, renewed.Certificate).Raw, leaf.Raw)
	})

	t.Run("should revoke the certificate in ACM", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newAcmRig(t, tn)
		certID, _ := r.o.issue(t, r.request("www."+r.zoneName))

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		got := r.onlyCertificate(t)
		require.Equal(t, "REVOKED", got.Status)
		require.Equal(t, "KEY_COMPROMISE", got.RevocationReason)
	})

	t.Run("should refuse an update naming a hosted zone the DNS connection cannot reach", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newAcmRig(t, tn)
		missing := "ZMISSING" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateAwsAcmPublicCaCertificateAuthorityV1WithBodyWithResponse(t.Context(), r.ca.ID.String(), "application/json",
			bytes.NewReader(jsonBody(t, map[string]any{"configuration": map[string]any{
				"appConnectionId": r.conn.ID, "dnsAppConnectionId": r.conn.ID, "hostedZoneId": missing, "region": "us-east-1"}})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to access Route 53 hosted zone: No hosted zone found with ID: "+missing, apierr.Message(res.Body))
		got, err := tn.Admin.API.GetAwsAcmPublicCaCertificateAuthorityV1WithResponse(t.Context(), r.ca.ID.String())
		require.NoError(t, err)
		require.Equal(t, r.zone, decode(t, got.Body)["configuration"].(map[string]any)["hostedZoneId"])
	})
}
