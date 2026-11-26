package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestApplication_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the organization's applications with their profile count", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))
		empty := pki.NewApplication(t, g.Project)

		// Action
		res, err := tn.Admin.API.ListPkiApplicationsWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing applications returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		profiles := map[string]int{}
		for _, a := range res.JSON200.Applications {
			profiles[a.Id.String()] = a.ProfileCount
		}
		require.Equal(t, map[string]int{g.App.ID.String(): 1, empty.ID.String(): 0}, profiles)
		require.Equal(t, 2, res.JSON200.Total)
	})

	t.Run("should return the same application by id and by name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		byID, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
		require.NoError(t, err)
		require.NotNilf(t, byID.JSON200, "reading the application returned %d: %s", byID.StatusCode(), apierr.Body(byID.Body))

		// Action
		res, err := tn.Admin.API.GetPkiApplicationByNameWithResponse(t.Context(), byID.JSON200.Application.Name)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the application by name returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, app.ID, res.JSON200.Application.Id)
	})

	t.Run("should not find another organization's application by id", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, owner))

		// Action
		res, err := other.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	})
}
