package fixture

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// NewGroup creates a group owned by this sub-organization and returns its id. It is
// not a *Group: a Group manages its members through the root admin, who cannot reach
// a sub-organization's own groups.
func (s *SubOrg) NewGroup(tt *testing.T, name string) uuid.UUID {
	tt.Helper()

	res, err := s.Admin.API.CreateGroupWithResponse(tt.Context(), api.CreateGroupJSONRequestBody{Name: name})
	require.NoErrorf(tt, err, "creating group %s in %s", name, s.Slug)
	require.NotNilf(tt, res.JSON200, "creating group %s in %s returned %d: %s", name, s.Slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Id
}

// LinkGroup links a root organization group into this sub-organization with
// permanent organization roles.
func (s *SubOrg) LinkGroup(tt *testing.T, g *Group, roles ...string) {
	tt.Helper()

	if len(roles) == 0 {
		roles = []string{"member"}
	}
	items := make([]map[string]any, 0, len(roles))
	for _, slug := range roles {
		items = append(items, map[string]any{"role": slug, "isTemporary": false})
	}
	raw, err := json.Marshal(map[string]any{"roles": items})
	require.NoError(tt, err)

	res, err := s.Admin.API.CreateOrganizationGroupMembershipWithBodyWithResponse(tt.Context(), g.ID,
		"application/json", bytes.NewReader(raw))
	require.NoErrorf(tt, err, "linking group %s into %s", g.Name, s.Slug)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "linking group %s into %s: %s", g.Name, s.Slug, apierr.Body(res.Body))
}

// LinkIdentity gives a root organization machine identity a direct membership in this
// sub-organization with permanent organization roles.
func (s *SubOrg) LinkIdentity(tt *testing.T, identityID uuid.UUID, roles ...string) {
	tt.Helper()

	if len(roles) == 0 {
		roles = []string{"member"}
	}
	items := make([]map[string]any, 0, len(roles))
	for _, slug := range roles {
		items = append(items, map[string]any{"role": slug, "isTemporary": false})
	}
	raw, err := json.Marshal(map[string]any{"roles": items})
	require.NoError(tt, err)

	res, err := s.Admin.API.CreateOrganizationIdentityMembershipWithBodyWithResponse(tt.Context(), identityID.String(),
		"application/json", bytes.NewReader(raw))
	require.NoErrorf(tt, err, "linking identity %s into %s", identityID, s.Slug)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "linking identity %s into %s: %s", identityID, s.Slug, apierr.Body(res.Body))
}

// NewProject creates a secret-manager project in this sub-organization, with its
// admin as the project admin, and returns the project id.
func (s *SubOrg) NewProject(tt *testing.T) string {
	tt.Helper()

	kind := api.CreateProjectJSONBodyType("secret-manager")
	name := "p-" + id.Short()
	res, err := s.Admin.API.CreateProjectWithResponse(tt.Context(), api.CreateProjectJSONRequestBody{ProjectName: name, Type: &kind})
	require.NoErrorf(tt, err, "creating project %s in %s", name, s.Slug)
	require.NotNilf(tt, res.JSON200, "creating project %s in %s returned %d: %s", name, s.Slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Project.Id
}

// GroupUserIDs lists the users in a group, as the given client sees it.
func GroupUserIDs(tt *testing.T, client *api.ClientWithResponses, groupID uuid.UUID) []uuid.UUID {
	tt.Helper()

	filter := api.ListGroupUsersParamsFilterExistingMembers
	res, err := client.ListGroupUsersWithResponse(tt.Context(), groupID.String(), &api.ListGroupUsersParams{Filter: &filter})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "listing the users of group %s returned %d: %s", groupID, res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, u := range res.JSON200.Users {
		out = append(out, u.Id)
	}
	return out
}
