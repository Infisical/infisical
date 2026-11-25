package pki

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// AddMember gives a user or machine identity of the organization a role on the
// application: admin, operator or auditor.
func AddMember(tt *testing.T, app Application, member *harness.Principal, role string) {
	tt.Helper()
	client := app.project.tn.Admin.API
	if member.Kind == harness.MachineIdentity {
		res, err := client.AddPkiApplicationIdentityMemberWithResponse(tt.Context(), app.ID, member.ID, api.AddPkiApplicationIdentityMemberJSONRequestBody{Role: role})
		require.NoError(tt, err, "adding an identity to the application")
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding an identity to the application: %s", apierr.Body(res.Body))
		return
	}
	res, err := client.AddPkiApplicationUserMembersWithResponse(tt.Context(), app.ID, api.AddPkiApplicationUserMembersJSONRequestBody{
		UserIds: &[]uuid.UUID{member.ID},
		Role:    &role,
	})
	require.NoError(tt, err, "adding a user to the application")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding a user to the application: %s", apierr.Body(res.Body))
}
