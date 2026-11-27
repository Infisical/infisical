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

	t.Run("should read back a new name and description when an application admin edits it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		admin := pki.NewMember(t, app, "admin-"+id.Short(), "admin")
		name := "renamed-" + id.Short()

		// Action
		res, err := admin.API.UpdatePkiApplicationWithResponse(t.Context(), app.ID, api.UpdatePkiApplicationJSONRequestBody{
			Name:        &name,
			Description: new("edited by its admin"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the application: %s", apierr.Body(res.Body))
		got := readApplication(t, tn, app)
		require.Equal(t, name, got.Name)
		require.Equal(t, new("edited by its admin"), got.Description)
	})

	t.Run("should refuse an application auditor's edit and keep the name and description", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))
		auditor := pki.NewMember(t, app, "auditor-"+id.Short(), "auditor")
		before := readApplication(t, tn, app)

		// Action
		res, err := auditor.API.UpdatePkiApplicationWithResponse(t.Context(), app.ID, api.UpdatePkiApplicationJSONRequestBody{
			Name:        new("renamed-" + id.Short()),
			Description: new("edited by its auditor"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		after := readApplication(t, tn, app)
		require.Equal(t, before.Name, after.Name)
		require.Equal(t, before.Description, after.Description)
	})
}
