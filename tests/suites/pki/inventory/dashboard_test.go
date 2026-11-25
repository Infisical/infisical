package inventory_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// issueTwoRevokeOne leaves the graph's project with one active and one revoked
// certificate.
func issueTwoRevokeOne(t *testing.T, tn *harness.Tenant, g *pki.Graph) {
	t.Helper()
	g.Issue(t, pki.ServerCertificate(id.Short()+".active.test"))
	revoked := g.Issue(t, pki.ServerCertificate(id.Short()+".revoked.test"))
	pki.Revoke(t, tn.Admin, revoked, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
}

func TestCertificateDashboard(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should count the project's certificates by status", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issueTwoRevokeOne(t, tn, g)

		// Action
		res, err := tn.Admin.API.GetCertificateDashboardStatsWithResponse(t.Context(), g.Project.ID.String())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading dashboard stats returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		totals := res.JSON200.Totals
		require.EqualValues(t, 2, totals.Total)
		require.EqualValues(t, 1, totals.Active)
		require.EqualValues(t, 1, totals.Revoked)
	})

	t.Run("should count the issuances and revocations in the activity trend", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issueTwoRevokeOne(t, tn, g)

		// Action
		res, err := tn.Admin.API.GetCertificateActivityTrendWithResponse(t.Context(), g.Project.ID.String(), &api.GetCertificateActivityTrendParams{Range: new(api.GetCertificateActivityTrendParamsRangeN7d)})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the activity trend returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var issued, revoked float32
		for _, p := range res.JSON200.Periods {
			issued += p.Issued
			revoked += p.Revoked
		}
		require.EqualValues(t, 2, issued)
		require.EqualValues(t, 1, revoked)
	})

	t.Run("should count the RSA certificates as non-PQC in the PQC trend", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issueTwoRevokeOne(t, tn, g)

		// Action
		res, err := tn.Admin.API.GetCertificatePqcTrendWithResponse(t.Context(), g.Project.ID.String(), &api.GetCertificatePqcTrendParams{Range: new(api.GetCertificatePqcTrendParamsRangeN7d)})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the PQC trend returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotEmpty(t, res.JSON200.Periods)
		last := res.JSON200.Periods[len(res.JSON200.Periods)-1]
		require.Zero(t, last.Pqc)
		require.NotZero(t, last.NonPqc)
	})
}
