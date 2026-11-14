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

// GroupOption adjusts a new group.
type GroupOption func(*api.CreateGroupJSONRequestBody)

// WithGroupRole sets the group's organization role. Without it a group gets no-access.
func WithGroupRole(slug string) GroupOption {
	return func(b *api.CreateGroupJSONRequestBody) { b.Role = &slug }
}

func NewGroup(tt *testing.T, tn *harness.Tenant, opts ...GroupOption) *Group {
	tt.Helper()

	name := "g-" + id.Short()
	body := api.CreateGroupJSONRequestBody{Name: name}
	for _, o := range opts {
		o(&body)
	}
	res, err := tn.Admin.API.CreateGroupWithResponse(tt.Context(), body)
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

// RemoveUser takes users out of the group.
func (g *Group) RemoveUser(tt *testing.T, users ...*harness.Principal) {
	tt.Helper()

	for _, user := range users {
		require.Equalf(tt, harness.User, user.Kind, "%s is not a user", user.Name)
		res, err := g.tn.Admin.API.RemoveUserFromGroupWithResponse(tt.Context(), g.ID.String(), user.Email)
		require.NoErrorf(tt, err, "removing %s from group %s", user.Email, g.Name)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "removing %s from group %s: %s",
			user.Email, g.Name, apierr.Body(res.Body))
	}
}

// AddIdentity puts existing machine identities in the group.
func (g *Group) AddIdentity(tt *testing.T, identities ...*harness.Principal) {
	tt.Helper()

	for _, identity := range identities {
		require.Equalf(tt, harness.MachineIdentity, identity.Kind, "%s is not a machine identity", identity.Name)
		res, err := g.tn.Admin.API.AddMachineIdentityToGroupWithResponse(tt.Context(), g.ID.String(), identity.ID.String())
		require.NoErrorf(tt, err, "adding identity %s to group %s", identity.Name, g.Name)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding identity %s to group %s: %s",
			identity.Name, g.Name, apierr.Body(res.Body))
	}
}

// RemoveIdentity takes machine identities out of the group.
func (g *Group) RemoveIdentity(tt *testing.T, identities ...*harness.Principal) {
	tt.Helper()

	for _, identity := range identities {
		res, err := g.tn.Admin.API.RemoveMachineIdentityFromGroupWithResponse(tt.Context(), g.ID.String(), identity.ID.String())
		require.NoErrorf(tt, err, "removing identity %s from group %s", identity.Name, g.Name)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "removing identity %s from group %s: %s",
			identity.Name, g.Name, apierr.Body(res.Body))
	}
}
