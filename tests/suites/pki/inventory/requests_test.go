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

func TestCertificateRequests_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list one issued request per certificate issued through the profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		first := g.Issue(t, pki.ServerCertificate(id.Short()+".one.test"))
		second := g.Issue(t, pki.ServerCertificate(id.Short()+".two.test"))
		other := pki.NewProfile(t, g.Project, g.CA, g.Policy)
		otherApp := pki.NewApplication(t, g.Project, other)
		pki.EnableAPI(t, otherApp, other, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		pki.Issue(t, otherApp, other, pki.ServerCertificate(id.Short()+".other.test"))

		// Action
		//lint:ignore SA1019 the deprecated list route is still served, and this subtest covers it
		res, err := tn.Admin.API.ListCertificateRequestsWithResponse(t.Context(), &api.ListCertificateRequestsParams{ProfileIds: new(g.Profile.ID.String())})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var certs []string
		for _, r := range res.JSON200.CertificateRequests {
			require.Equal(t, "issued", string(r.Status))
			require.NotNil(t, r.CertificateId)
			certs = append(certs, *r.CertificateId)
		}
		require.ElementsMatch(t, []string{first.ID.String(), second.ID.String()}, certs)
		require.Equal(t, 2, pki.Requests(t, g.Project, g.Profile), "the search the refusal tests count with filters by profile the same way")
	})

	t.Run("should find only the request for the common name searched for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".wanted.test"
		wanted := g.Issue(t, pki.ServerCertificate(name))
		g.Issue(t, pki.ServerCertificate(id.Short()+".other.test"))

		// Action
		res, err := tn.Admin.API.SearchCertificateRequestsWithResponse(t.Context(), api.SearchCertificateRequestsJSONRequestBody{Search: &name})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "searching requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.CertificateRequests, 1)
		require.Equal(t, new(wanted.ID.String()), res.JSON200.CertificateRequests[0].CertificateId)
		require.EqualValues(t, 1, res.JSON200.TotalCount)
	})

	t.Run("should find no request when filtered by a status none has", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate(id.Short()+".issued.test"))

		// Action
		res, err := tn.Admin.API.SearchCertificateRequestsWithResponse(t.Context(), api.SearchCertificateRequestsJSONRequestBody{Status: new(api.SearchCertificateRequestsJSONBodyStatusRejected)})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "searching requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Empty(t, res.JSON200.CertificateRequests)
	})
}
