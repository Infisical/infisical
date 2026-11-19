package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestApplication_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back a new name and description", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		name := "renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationWithResponse(t.Context(), app.ID, api.UpdatePkiApplicationJSONRequestBody{
			Name:        &name,
			Description: new("payments edge"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the application: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the application returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, name, got.JSON200.Application.Name)
		require.Equal(t, new("payments edge"), got.JSON200.Application.Description)
	})

	t.Run("should refuse a name another application has and keep the original", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		taken, app := pki.NewApplication(t, proj), pki.NewApplication(t, proj)
		takenRes, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), taken.ID)
		require.NoError(t, err)
		require.NotNil(t, takenRes.JSON200)
		before, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
		require.NoError(t, err)
		require.NotNil(t, before.JSON200)
		name := takenRes.JSON200.Application.Name

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationWithResponse(t.Context(), app.ID, api.UpdatePkiApplicationJSONRequestBody{Name: &name})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "An application with name '"+name+"' already exists in this organization.", apierr.Message(res.Body))
		after, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
		require.NoError(t, err)
		require.Equal(t, before.JSON200.Application.Name, after.JSON200.Application.Name)
	})
}
