package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

var (
	readConnectionsRule = fixture.Permission{Subject: "app-connections", Action: []string{"read"}}
	denyConnectionsRule = fixture.Permission{Subject: "app-connections", Action: []string{"read"}, Inverted: true}
)

func TestGroup_Permission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give a member the group's org role on top of their own", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))
		status, body := readConnections(t, member.API)
		requireStatus(t, http.StatusForbidden, status, body)

		// Action
		group.AddUser(t, member)

		// Assert
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return readConnections(t, member.API) })
		require.Equal(t, "member", fixture.MembershipOf(t, tn, member.Email).Role)
	})

	t.Run("should drop the group's org role when the member leaves the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))
		group.AddUser(t, member)
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return readConnections(t, member.API) })

		// Action
		group.RemoveUser(t, member)

		// Assert
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return readConnections(t, member.API) })
		require.Contains(t, string(body), "You are not allowed to read on app-connections")
	})

	t.Run("should give a machine identity the group's org role and project role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FROM_GROUP", "value")
		identity := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))
		proj.GrantGroup(t, group, "viewer")

		// Action
		group.AddIdentity(t, identity)

		// Assert
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return readConnections(t, identity.API) })
		body := waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, identity.API, proj.ID) })
		require.Contains(t, string(body), "FROM_GROUP")
	})

	t.Run("should give a machine identity the union of its direct project role and its group's", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		proj.NewRole(t, "creator", fixture.Permission{Subject: "secrets", Action: []string{"create"}})
		identity := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		proj.Grant(t, identity, "viewer")
		group := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, group, "creator")
		status, body := createSecret(t, identity.API, proj.ID, "BEFORE_GROUP")
		requireStatus(t, http.StatusForbidden, status, body)

		// Action
		group.AddIdentity(t, identity)

		// Assert
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return createSecret(t, identity.API, proj.ID, "FROM_GROUP") })
		status, body = listSecrets(t, identity.API, proj.ID)
		requireStatus(t, http.StatusOK, status, body)
		require.Contains(t, string(body), "EXISTING")
	})

	t.Run("should let a deny in the group's org role override an allow in the member's own role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "conn-reader", readConnectionsRule)
		fixture.NewOrgRole(t, tn, "conn-denier", denyConnectionsRule)
		member := tn.NewUser(t, harness.OrgRole("conn-reader"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("conn-denier"))
		status, body := readConnections(t, member.API)
		requireStatus(t, http.StatusOK, status, body)

		// Action
		group.AddUser(t, member)

		// Assert
		body = waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return readConnections(t, member.API) })
		require.Contains(t, string(body), "You are not allowed to read on app-connections")
	})

	t.Run("should let a deny in the member's own role override an allow from the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "conn-denier", denyConnectionsRule)
		member := tn.NewUser(t, harness.OrgRole("conn-denier"))
		peer := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))
		group.AddIdentity(t, peer)
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return readConnections(t, peer.API) })

		// Action
		group.AddUser(t, member)

		// Assert
		status, body := readConnections(t, member.API)
		requireStatus(t, http.StatusForbidden, status, body)
		require.Contains(t, string(body), "You are not allowed to read on app-connections")
	})

	t.Run("should give no group-derived project access to a deactivated member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		proj.GrantGroup(t, group, "viewer")
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, member.API, proj.ID) })
		membership := fixture.MembershipOf(t, tn, member.Email)

		// Action
		res, err := tn.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String(),
			api.UpdateOrgMembershipJSONRequestBody{IsActive: new(false)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return listSecrets(t, member.API, proj.ID) })
		require.Contains(t, string(body), "User organization membership is inactive")
	})

	t.Run("should stop a temporary group project role at its end time while the permanent role still applies", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)

		// Action
		res, err := tn.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), proj.ID, group.ID,
			"application/json", rolesBody(t, permanent("viewer"), expired("member")))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, member.API, proj.ID) })
		require.Contains(t, string(body), "EXISTING")
		status, body := createSecret(t, member.API, proj.ID, "WRITTEN")
		requireStatus(t, http.StatusForbidden, status, body)
	})

	t.Run("should give no access through a group with the default no-access role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("no-access"))
		group := fixture.NewGroup(t, tn)

		// Action
		group.AddUser(t, member)

		// Assert
		res, err := member.API.ListGroupsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to read on groups")
		require.Equal(t, "no-access", groupRole(t, tn, group.ID))
	})
}
