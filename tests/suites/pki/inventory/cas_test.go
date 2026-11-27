package inventory_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func listCAs(t *testing.T, tn *harness.Tenant, p *pki.Project, params *api.ListProjectCertificateAuthoritiesParams) []string {
	t.Helper()
	res, err := tn.Admin.API.ListProjectCertificateAuthoritiesWithResponse(t.Context(), p.ID.String(), params)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the project's CAs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, ca := range res.JSON200.Cas {
		ids = append(ids, ca.Id.String())
	}
	return ids
}

func TestProjectCertificateAuthorities_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list every internal CA of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		root := pki.NewInternalCA(t, p)
		intermediate := pki.NewIntermediateCA(t, p, root)

		// Action
		got := listCAs(t, tn, p, nil)

		// Assert
		require.ElementsMatch(t, []string{root.ID.String(), intermediate.ID.String()}, got)
	})

	t.Run("should list only CAs waiting for a certificate when filtered by that status", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		pki.NewInternalCA(t, p)
		pending := pki.NewPendingIntermediateCA(t, p)

		// Action
		got := listCAs(t, tn, p, &api.ListProjectCertificateAuthoritiesParams{Status: new(api.ListProjectCertificateAuthoritiesParamsStatusPendingCertificate)})

		// Assert
		require.Equal(t, []string{pending.ID.String()}, got)
	})
}
