package pki

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Application is what clients enroll through: profiles attached to it, each with its
// enrollment methods.
type Application struct {
	ID uuid.UUID

	project *Project
}

// NewApplication creates an application with the profiles attached.
func NewApplication(tt *testing.T, p *Project, profiles ...Profile) Application {
	tt.Helper()
	res, err := p.tn.Admin.API.CreatePkiApplicationWithBodyWithResponse(tt.Context(), "application/json", jsonBody(tt, map[string]any{
		"name": "app-" + id.Short(),
	}))
	require.NoError(tt, err, "creating an application")
	require.NotNilf(tt, res.JSON200, "creating an application returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	app := Application{ID: res.JSON200.Application.Id, project: p}

	ids := make([]uuid.UUID, 0, len(profiles))
	for _, pr := range profiles {
		ids = append(ids, pr.ID)
	}
	attach, err := p.tn.Admin.API.AttachPkiApplicationProfilesWithBodyWithResponse(tt.Context(), app.ID, "application/json", jsonBody(tt, map[string]any{"profileIds": ids}))
	require.NoError(tt, err, "attaching profiles")
	require.Equalf(tt, http.StatusOK, attach.StatusCode(), "attaching profiles: %s", apierr.Body(attach.Body))
	return app
}
