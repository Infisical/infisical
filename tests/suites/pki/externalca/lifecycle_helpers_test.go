package externalca_test

import (
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// issue orders a certificate and requires the request to end issued.
func (o orderIssuer) issue(t *testing.T, body api.CreateCertificateJSONRequestBody) (uuid.UUID, *api.GetCertificateRequestResponse) {
	t.Helper()
	got := o.Settled(t, o.order(t, body).JSON200.CertificateRequestId)
	require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
	certID, err := uuid.Parse(*got.JSON200.CertificateId)
	require.NoError(t, err)
	return certID, got
}

// renew renews a certificate as the operator and returns the request the renewal runs
// under.
func (o orderIssuer) renew(t *testing.T, certID uuid.UUID, body map[string]any) string {
	t.Helper()
	res := pki.Renew(t, o.Operator, certID, body)
	require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.CertificateRequestId
}

// certificateStatus is a certificate's status as the operator reads it.
func (o orderIssuer) certificateStatus(t *testing.T, certID uuid.UUID) string {
	t.Helper()
	return pki.ReadCertificate(t, o.Operator, certID).JSON200.Certificate.Status
}

func decode(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	out := map[string]any{}
	require.NoErrorf(t, json.Unmarshal(raw, &out), "not JSON: %s", raw)
	return out
}

func jsonBody(t *testing.T, v any) []byte {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return raw
}
