package profiles_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a profile no application uses so it can no longer be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t)))

		// Action
		res, err := tn.Admin.API.DeleteCertificateProfileWithResponse(t.Context(), profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the profile: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCertificateProfileWithResponse(t.Context(), profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted profile: %s", apierr.Body(got.Body))
	})

	t.Run("should refuse to delete a profile attached to an application and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))
		app, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), g.App.ID)
		require.NoError(t, err)
		require.NotNil(t, app.JSON200)

		// Action
		res, err := tn.Admin.API.DeleteCertificateProfileWithResponse(t.Context(), g.Profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "deleting the profile: %s", apierr.Body(res.Body))
		require.Equal(t, fmt.Sprintf("Cannot delete this certificate profile while it is attached to 1 application (%s). Detach the profile from those applications first.", app.JSON200.Application.Name), apierr.Message(res.Body))
		got, err := tn.Admin.API.GetCertificateProfileWithResponse(t.Context(), g.Profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the profile: %s", apierr.Body(got.Body))
	})
}
