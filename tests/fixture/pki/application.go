package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
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
	var ids *[]uuid.UUID
	if len(profiles) > 0 {
		list := make([]uuid.UUID, 0, len(profiles))
		for _, pr := range profiles {
			list = append(list, pr.ID)
		}
		ids = &list
	}
	res, err := p.tn.Admin.API.CreatePkiApplicationWithResponse(tt.Context(), api.CreatePkiApplicationJSONRequestBody{
		Name:       "app-" + id.Short(),
		ProfileIds: ids,
	})
	require.NoError(tt, err, "creating an application")
	require.NotNilf(tt, res.JSON200, "creating an application returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return Application{ID: res.JSON200.Application.Id, project: p}
}
