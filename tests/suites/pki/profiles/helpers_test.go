package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// secondProfile is another profile on the graph's CA and policy, attached to its
// application with API enrollment on.
func secondProfile(t *testing.T, tn *harness.Tenant, g *pki.Graph) pki.Profile {
	t.Helper()
	profile := pki.NewProfile(t, g.Project, g.CA, g.Policy)
	res, err := tn.Admin.API.AttachPkiApplicationProfilesWithResponse(t.Context(), g.App.ID, api.AttachPkiApplicationProfilesJSONRequestBody{ProfileIds: []uuid.UUID{profile.ID}})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "attaching the profile: %s", apierr.Body(res.Body))
	pki.EnableAPI(t, g.App, profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
	return profile
}

func policyName(t *testing.T, tn *harness.Tenant, policy pki.Policy) string {
	t.Helper()
	res, err := tn.Admin.API.GetCertificatePolicyWithResponse(t.Context(), policy.ID, nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.CertificatePolicy.Name
}
