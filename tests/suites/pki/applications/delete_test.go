package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestApplication_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the application from reads and lists", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		app := pki.NewApplication(t, pki.CertManager(t, tn))

		// Action
		res, err := tn.Admin.API.DeletePkiApplicationWithResponse(t.Context(), app.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the application: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted application: %s", apierr.Body(got.Body))
		list, err := tn.Admin.API.ListPkiApplicationsWithResponse(t.Context(), nil)
		require.NoError(t, err)
		require.NotNil(t, list.JSON200)
		require.Empty(t, list.JSON200.Applications)
	})

	t.Run("should stop its operator issuing once the application is deleted", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "[BUG?] the application no longer exists, yet the server answers 403 'not a member' rather than 404")

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		del, err := tn.Admin.API.DeletePkiApplicationWithResponse(t.Context(), g.App.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting the application: %s", apierr.Body(del.Body))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".gone.test"))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not a member of this certificate-application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}
