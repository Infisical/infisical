package est_test

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"math/big"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// storedCert is the inventory's view of an issued leaf: its id and the renewal links on it.
type storedCert struct {
	ID          uuid.UUID
	RenewedBy   *uuid.UUID
	RenewedFrom *uuid.UUID
}

// stored finds the leaf among the profile's certificate requests by serial number and reads its renewal links.
func (p estProfile) stored(t *testing.T, tn *harness.Tenant, leaf *x509.Certificate) storedCert {
	t.Helper()
	res, err := tn.Admin.API.SearchCertificateRequestsWithResponse(t.Context(), api.SearchCertificateRequestsJSONRequestBody{
		ProfileIds: &[]uuid.UUID{p.Profile.ID},
		Limit:      new(float32(100)),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "searching the profile's certificate requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, r := range res.JSON200.CertificateRequests {
		if r.Certificate == nil {
			continue
		}
		serial, ok := new(big.Int).SetString(r.Certificate.SerialNumber, 16)
		if !ok || serial.Cmp(leaf.SerialNumber) != 0 {
			continue
		}
		certID, err := uuid.Parse(r.Certificate.Id)
		require.NoError(t, err)
		read := pki.ReadCertificate(t, tn.Admin, certID).JSON200.Certificate
		return storedCert{ID: certID, RenewedBy: read.RenewedByCertificateId, RenewedFrom: read.RenewedFromCertificateId}
	}
	require.Failf(t, "certificate not in the inventory", "no certificate with serial %X on the profile", leaf.SerialNumber)
	return storedCert{}
}

// newRenewalPolicy holds every renewal on the profile for one approval from approver. The generated
// client predates the policy type, so the body goes out as JSON.
func (p estProfile) newRenewalPolicy(t *testing.T, tn *harness.Tenant, approver uuid.UUID) {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"name":        "renewal-" + id.Short(),
		"scope":       "pki-application",
		"scopeId":     p.App.ID,
		"conditions":  []map[string]any{{"profileNames": []string{p.Profile.Slug}}},
		"constraints": map[string]any{"operation": "renewal"},
		"steps": []map[string]any{{
			"requiredApprovals": 1,
			"approvers":         []map[string]any{{"type": "user", "id": approver}},
		}},
	})
	require.NoError(t, err)
	res, err := tn.Admin.API.CreateCertRequestApprovalPolicyWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating the Renewal policy: %s", apierr.Body(res.Body))
}
