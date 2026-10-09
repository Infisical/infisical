package fixture

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Group is an organization group. It holds users and identities but is not a
// principal: it cannot log in, so it never carries a token.
type Group struct {
	ID   uuid.UUID
	Name string
	Slug string

	tn *harness.Tenant
}

func NewGroup(tt *testing.T, tn *harness.Tenant) *Group {
	tt.Helper()

	name := "g-" + id.Short()
	res, err := tn.Admin.API.CreateGroupWithResponse(tt.Context(), api.CreateGroupJSONRequestBody{Name: name})
	require.NoErrorf(tt, err, "creating group %s", name)
	require.NotNilf(tt, res.JSON200, "creating group %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))

	return &Group{ID: res.JSON200.Id, Name: res.JSON200.Name, Slug: res.JSON200.Slug, tn: tn}
}

// AddUser puts existing organization users in the group.
func (g *Group) AddUser(tt *testing.T, users ...*harness.Principal) {
	tt.Helper()

	for _, user := range users {
		require.Equalf(tt, harness.User, user.Kind, "%s is not a user", user.Name)
		res, err := g.tn.Admin.API.AddUserToGroupWithResponse(tt.Context(), g.ID.String(), user.Email)
		require.NoErrorf(tt, err, "adding %s to group %s", user.Email, g.Name)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding %s to group %s: %s",
			user.Email, g.Name, apierr.Body(res.Body))
	}
}
