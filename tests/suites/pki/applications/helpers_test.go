package applications_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// member is a new Product Member with a role on the graph's application, or on none
// when role is empty.
func member(t *testing.T, tn *harness.Tenant, g *pki.Graph, role string) *harness.Principal {
	t.Helper()
	u := tn.NewUser(t, harness.WithName(role+"-"+id.Short()))
	g.Project.Grant(t, u)
	if role != "" {
		pki.AddMember(t, g.App, u, role)
	}
	return u
}

func revokeAs(t *testing.T, as *harness.Principal, certID uuid.UUID) *api.RevokeCertificateResponse {
	t.Helper()
	res, err := as.API.RevokeCertificateWithResponse(t.Context(), certID.String(), api.RevokeCertificateJSONRequestBody{
		RevocationReason: api.KEYCOMPROMISE,
	})
	require.NoError(t, err)
	return res
}

// status is the certificate's status as the tenant admin reads it.
func status(t *testing.T, tn *harness.Tenant, certID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.GetCertificateWithResponse(t.Context(), certID, nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Certificate.Status
}
