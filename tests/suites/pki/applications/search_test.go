package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestApplicationCertificateSearch(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should find only the application's certificates for an auditor without project-level read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		wanted := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		other := pki.NewApplication(t, g.Project, g.Profile)
		pki.EnableAPI(t, other, g.Profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		pki.Issue(t, other, g.Profile, pki.ServerCertificate(id.Short()+".other.test"))
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := auditor.API.SearchCertificatesWithResponse(t.Context(), api.SearchCertificatesJSONRequestBody{ApplicationIds: &[]uuid.UUID{g.App.ID}})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "searching certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var got []uuid.UUID
		for _, c := range res.JSON200.Certificates {
			got = append(got, c.Id)
		}
		require.Equal(t, []uuid.UUID{wanted.ID}, got)
		require.EqualValues(t, 1, res.JSON200.TotalCount)
	})

	t.Run("should limit a search to the certificates a conditional project-level read allows", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		commonName := id.Short() + ".app.test"
		wanted := g.Issue(t, pki.ServerCertificate(commonName))
		g.Issue(t, pki.ServerCertificate(id.Short()+".hidden.test"))
		project := fixture.ExistingProject(tn, g.Project.ID.String())
		project.NewRole(t, "read-one-name", fixture.Permission{
			Subject:    "certificates",
			Action:     []string{"read"},
			Conditions: map[string]any{"commonName": map[string]any{"$eq": commonName}},
		})
		reader := tn.NewUser(t, harness.WithName("reader-"+id.Short()))
		project.Grant(t, reader, "read-one-name")

		// Action
		res, err := reader.API.SearchCertificatesWithResponse(t.Context(), api.SearchCertificatesJSONRequestBody{ApplicationIds: &[]uuid.UUID{g.App.ID}})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "searching certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var got []uuid.UUID
		for _, c := range res.JSON200.Certificates {
			got = append(got, c.Id)
		}
		require.Equal(t, []uuid.UUID{wanted.ID}, got)
		require.EqualValues(t, 1, res.JSON200.TotalCount)
	})

	t.Run("should refuse an auditor's search that also names an application it can't read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		other := pki.NewApplication(t, g.Project, g.Profile)
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := auditor.API.SearchCertificatesWithResponse(t.Context(), api.SearchCertificatesJSONRequestBody{ApplicationIds: &[]uuid.UUID{g.App.ID, other.ID}})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "searching certificates: %s", apierr.Body(res.Body))
	})

	t.Run("should refuse an auditor's search across the whole project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := auditor.API.SearchCertificatesWithResponse(t.Context(), api.SearchCertificatesJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "searching certificates: %s", apierr.Body(res.Body))
	})
}
