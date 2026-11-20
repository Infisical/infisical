//lint:file-ignore SA1019 these tests cover the project-scoped search route, which is deprecated but still served

package inventory_test

import (
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func search(t *testing.T, tn *harness.Tenant, g *pki.Graph, body api.SearchProjectCertificatesJSONRequestBody) []string {
	t.Helper()
	res, err := tn.Admin.API.SearchProjectCertificatesWithResponse(t.Context(), g.Project.ID.String(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "searching certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	serials := []string{}
	for _, c := range res.JSON200.Certificates {
		serials = append(serials, c.SerialNumber)
	}
	require.EqualValues(t, len(serials), res.JSON200.TotalCount)
	return serials
}

func TestCertificateSearch(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should find only the certificate with the common name searched for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".wanted.test"
		wanted := g.Issue(t, pki.ServerCertificate(name))
		g.Issue(t, pki.ServerCertificate(id.Short()+".other.test"))

		// Action
		got := search(t, tn, g, api.SearchProjectCertificatesJSONRequestBody{CommonName: &name})

		// Assert
		require.Equal(t, []string{wanted.SerialNumber}, got)
	})

	t.Run("should find only revoked certificates when filtered by status", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		revoked := g.Issue(t, pki.ServerCertificate(id.Short()+".revoked.test"))
		g.Issue(t, pki.ServerCertificate(id.Short()+".active.test"))
		pki.Revoke(t, tn.Admin, revoked, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		got := search(t, tn, g, api.SearchProjectCertificatesJSONRequestBody{Status: new("revoked")})

		// Assert
		require.Equal(t, []string{revoked.SerialNumber}, got)
	})

	t.Run("should find only certificates expiring before the given date", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		short := pki.ServerCertificate(id.Short() + ".short.test")
		short.Attributes.Ttl = new("7d")
		soon := g.Issue(t, short)
		g.Issue(t, pki.ServerCertificate(id.Short()+".long.test"))

		// Action
		got := search(t, tn, g, api.SearchProjectCertificatesJSONRequestBody{NotAfterTo: new(time.Now().AddDate(0, 0, 14))})

		// Assert
		require.Equal(t, []string{soon.SerialNumber}, got)
	})
}
