package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// groupWithUser is an organization group holding one new user, not yet in Certificate
// Manager.
func groupWithUser(t *testing.T, tn *harness.Tenant) (*fixture.Group, *harness.Principal) {
	t.Helper()
	u := tn.NewUser(t, harness.WithName("carol"))
	g := fixture.NewGroup(t, tn)
	g.AddUser(t, u)
	return g, u
}

func addGroup(t *testing.T, tn *harness.Tenant, g *fixture.Group, role string) {
	t.Helper()
	res, err := tn.Admin.API.AddCertManagerGroupWithResponse(t.Context(), g.ID, api.AddCertManagerGroupJSONRequestBody{Role: &role})
	require.NoError(t, err)
	requireOK(t, res.StatusCode(), res.Body, "adding the group")
}

func TestCertManagerAccess_Groups(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a user of a group added as admin create a policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, u := groupWithUser(t, tn)

		// Action
		addGroup(t, tn, g, "admin")

		// Assert
		res, err := tn.Admin.API.GetCertManagerGroupWithResponse(t.Context(), g.ID)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the group membership returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "admin", res.JSON200.GroupMembership.Roles[0].Role)
		requirePolicyCreated(t, tn, u)
	})

	t.Run("should list the added group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, _ := groupWithUser(t, tn)
		addGroup(t, tn, g, "member")

		// Action
		res, err := tn.Admin.API.ListCertManagerGroupsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing groups returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []string
		for _, m := range res.JSON200.GroupMemberships {
			ids = append(ids, m.GroupId.String())
		}
		require.Equal(t, []string{g.ID.String()}, ids)
	})

	t.Run("should refuse a policy to a group user once the group is demoted to member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, u := groupWithUser(t, tn)
		addGroup(t, tn, g, "admin")

		// Action
		res, err := tn.Admin.API.UpdateCertManagerGroupWithBodyWithResponse(t.Context(), g.ID, "application/json", rolesBody(t, "member"))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "updating the group's role")
		requirePolicyRefused(t, tn, u)
	})

	t.Run("should stop a user of a removed group listing the project's CAs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, u := groupWithUser(t, tn)
		addGroup(t, tn, g, "member")

		// Action
		res, err := tn.Admin.API.RemoveCertManagerGroupWithResponse(t.Context(), g.ID)

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "removing the group")
		require.Equal(t, http.StatusForbidden, listCAsStatus(t, u))
	})
}
