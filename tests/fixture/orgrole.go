package fixture

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// NewOrgRole creates a custom organization role and returns its id. Hand its slug to
// harness.OrgRole. Rules use the same shape as a project role's.
func NewOrgRole(tt *testing.T, tn *harness.Tenant, slug string, permissions ...Permission) string {
	tt.Helper()

	if permissions == nil {
		permissions = []Permission{}
	}
	body, err := json.Marshal(map[string]any{"slug": slug, "name": slug, "permissions": permissions})
	require.NoError(tt, err)
	res, err := tn.Admin.API.CreateOrganizationRoleWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(body))
	require.NoErrorf(tt, err, "creating org role %s", slug)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating org role %s: %s", slug, apierr.Body(res.Body))
	return res.JSON200.Role.Id.String()
}
