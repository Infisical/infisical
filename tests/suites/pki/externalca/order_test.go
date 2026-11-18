package externalca_test

import (
	"encoding/hex"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// orderWait is how long a request waits for its certificate from an external CA.
// Infisical issues those one at a time across the instance, so parallel external CA
// tests queue behind each other well past the default 30 seconds.
const orderWait = 2 * time.Minute

// orderIssuer is an application issuing through a profile on an external CA, with an
// operator to request certificates.
type orderIssuer struct {
	app      pki.Application
	profile  pki.Profile
	operator *harness.Principal
}

func newOrderIssuer(t *testing.T, tn *harness.Tenant, proj *pki.Project, ca pki.CA) orderIssuer {
	t.Helper()
	return orderIssuerOn(t, tn, proj, pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t))))
}

// orderIssuerOn is an orderIssuer on a profile the test built itself.
func orderIssuerOn(t *testing.T, tn *harness.Tenant, proj *pki.Project, profile pki.Profile) orderIssuer {
	t.Helper()
	app := pki.NewApplication(t, proj, profile)
	pki.EnableAPI(t, app, profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
	operator := tn.NewUser(t, harness.WithName("operator"))
	proj.Grant(t, operator)
	pki.AddMember(t, app, operator, "operator")
	return orderIssuer{app: app, profile: profile, operator: operator}
}

// order requests a certificate and returns the response, which for an external CA
// carries a request rather than a certificate.
func (o orderIssuer) order(t *testing.T, body api.CreateCertificateJSONRequestBody) *api.CreateCertificateResponse {
	t.Helper()
	res := pki.Request(t, o.operator, o.app, o.profile, body)
	require.NotNilf(t, res.JSON200, "ordering a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// settled polls a certificate request until it is issued, failed or rejected, or
// reaches one of the statuses in also.
func (o orderIssuer) settled(t *testing.T, requestID string, also ...api.GetCertificateRequest200JSONResponseBodyStatus) *api.GetCertificateRequestResponse {
	t.Helper()
	want := append([]api.GetCertificateRequest200JSONResponseBodyStatus{
		api.GetCertificateRequest200JSONResponseBodyStatusIssued,
		api.GetCertificateRequest200JSONResponseBodyStatusFailed,
		api.GetCertificateRequest200JSONResponseBodyStatusRejected,
	}, also...)
	return pki.WaitRequest(t, o.operator, requestID, want, wait.Timeout(orderWait))
}

func TestCertificateOrder_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return a pending request and then issue a certificate from the upstream CA", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The API order flow for every external CA: the response carries a request, and the certificate arrives later.")

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := pki.NewCloudflareAcmeCA(t, proj)
		o := newOrderIssuer(t, tn, proj, ca)
		name := id.Short() + ".order.test"

		// Action
		res := o.order(t, pki.ServerCertificate(name))

		// Assert
		require.Nil(t, res.JSON200.Certificate)
		got := o.settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		require.NotNil(t, got.JSON200.CertificateId)
		require.NotNil(t, got.JSON200.Certificate)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, []string{name}, leaf.DNSNames)
		issued := up.State(t).Issued
		require.Len(t, issued, 1)
		require.Equal(t, issued[0].Serial, hex.EncodeToString(leaf.SerialNumber.Bytes()))
	})

	t.Run("should fail the request with a readable message when the upstream CA refuses", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := pki.NewCloudflareAcmeCA(t, proj)
		up.Fail(t, http.MethodPost, "/*", http.StatusInternalServerError,
			fakenet.Body(`{"type":"urn:ietf:params:acme:error:serverInternal","detail":"the CA is down for maintenance","status":500}`))
		o := newOrderIssuer(t, tn, proj, ca)

		// Action
		res := o.order(t, pki.ServerCertificate(id.Short()+".order.test"))

		// Assert
		got := o.settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusFailed, got.JSON200.Status)
		require.NotNil(t, got.JSON200.ErrorMessage)
		require.Equal(t, "Certificate issuance failed: the CA is down for maintenance", *got.JSON200.ErrorMessage)
		require.Nil(t, got.JSON200.CertificateId)
		require.Empty(t, up.State(t).Issued)
	})
}

func orderRequestID(t *testing.T, res *api.CreateCertificateResponse) uuid.UUID {
	t.Helper()
	reqID, err := uuid.Parse(res.JSON200.CertificateRequestId)
	require.NoError(t, err)
	return reqID
}
