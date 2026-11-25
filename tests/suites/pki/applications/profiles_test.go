package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestApplicationProfiles_Attach(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should attach a profile to an existing application so its enrollment can be configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))
		app := pki.NewApplication(t, g.Project)

		// Action
		res, err := tn.Admin.API.AttachPkiApplicationProfilesWithResponse(t.Context(), app.ID, api.AttachPkiApplicationProfilesJSONRequestBody{
			ProfileIds: []uuid.UUID{g.Profile.ID},
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "attaching the profile: %s", apierr.Body(res.Body))
		enroll, err := tn.Admin.API.SetPkiApplicationApiEnrollmentWithResponse(t.Context(), app.ID, g.Profile.ID, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, enroll.StatusCode(), "configuring API enrollment on the attached profile: %s", apierr.Body(enroll.Body))
	})
}
