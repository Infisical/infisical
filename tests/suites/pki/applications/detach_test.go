package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestApplicationProfiles_Detach(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should drop the profile from the application's profiles", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))

		// Action
		res, err := tn.Admin.API.DetachPkiApplicationProfileWithResponse(t.Context(), g.App.ID, g.Profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "detaching the profile: %s", apierr.Body(res.Body))
		list, err := tn.Admin.API.ListPkiApplicationProfilesWithResponse(t.Context(), g.App.ID)
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing the application's profiles returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		require.Empty(t, list.JSON200.Profiles)
	})

	t.Run("should refuse issuance through a detached profile and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		det, err := tn.Admin.API.DetachPkiApplicationProfileWithResponse(t.Context(), g.App.ID, g.Profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, det.StatusCode(), "detaching the profile: %s", apierr.Body(det.Body))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".detached.test"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This profile is not attached to the specified Application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}
