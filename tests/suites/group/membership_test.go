package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// oidcManagedGroups configures OIDC for the tenant and hands group membership to it.
func oidcManagedGroups(t *testing.T, tn *harness.Tenant) *sso.OIDC {
	t.Helper()
	oidc := sso.NewOIDC(t, tn)
	res, err := tn.Admin.API.UpdateOidcConfigWithResponse(t.Context(), api.UpdateOidcConfigJSONRequestBody{
		OrganizationId:         tn.OrgID.String(),
		ManageGroupMemberships: new(true),
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "enabling OIDC group management: %s", apierr.Body(res.Body))
	return oidc
}

func TestGroup_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a duplicate group name and keep one group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: group.Name})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This name or slug is already in use by another group in your organization")
		require.Equal(t, []string{group.Name}, groupNames(t, tn.Admin.API))
	})

	t.Run("should refuse creating a group when the plan lacks groups", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.Groups)))

		// Action
		res, err := tn.Admin.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: "unlicensed"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to create group due to plan restriction. Upgrade plan to create group.")
		require.Empty(t, groupNames(t, tn.Admin.API))
	})

	t.Run("should refuse renaming a group when the plan lacks groups, and keep its name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		group := fixture.NewGroup(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.Groups))

		// Action
		res, err := tn.Admin.API.UpdateGroupWithResponse(t.Context(), group.ID.String(), api.UpdateGroupJSONRequestBody{
			Name: new("renamed"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to update group due to plan restriction")
		require.Equal(t, []string{group.Name}, groupNames(t, tn.Admin.API))
	})

	t.Run("should refuse deleting a group when the plan lacks groups, and keep listing it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		group := fixture.NewGroup(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.Groups))

		// Action
		res, err := tn.Admin.API.DeleteGroupWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to delete group due to plan restriction. Upgrade plan to delete group.")
		require.Equal(t, []string{group.Name}, groupNames(t, tn.Admin.API))
	})
}

func TestGroup_Membership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse adding another organization's user and add nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), other.Admin.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "is not part of the organization")
		require.Empty(t, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should answer 404 for another organization's identity and add nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		outsider := other.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.AddMachineIdentityToGroupWithResponse(t.Context(), group.ID.String(), outsider.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Identity with id "+outsider.ID.String()+" is not part of the organization")
		require.Empty(t, groupIdentityIDs(t, tn, group.ID))
	})

	t.Run("should add an invited user who has not accepted yet", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		addr := invite(t, tn, "invitee")
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), addr)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []string{addr}, groupUsernames(t, tn, group.ID))
	})

	t.Run("should give an invited group member the group's project access once they accept", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FROM_GROUP", "value")
		addr := invite(t, tn, "invitee")
		group := fixture.NewGroup(t, tn)
		added, err := tn.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), addr)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		proj.GrantGroup(t, group, "viewer")

		// Action
		invitee := accept(t, tn, addr)

		// Assert
		body := waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, invitee, proj.ID) })
		require.Contains(t, string(body), "FROM_GROUP")
	})

	t.Run("should refuse adding a user twice and keep one membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)

		// Action
		res, err := tn.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), member.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "User(s) are already part of the group "+group.Slug)
		require.Equal(t, []string{member.Email}, groupUsernames(t, tn, group.ID))
	})

	t.Run("should refuse removing a user who is not in the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member, outsider := tn.NewUser(t), tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)

		// Action
		res, err := tn.Admin.API.RemoveUserFromGroupWithResponse(t.Context(), group.ID.String(), outsider.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "User(s) are not part of the group "+group.Slug)
		require.Equal(t, []string{member.Email}, groupUsernames(t, tn, group.ID))
	})

	t.Run("should refuse adding a user by hand when OIDC manages group memberships", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		oidcManagedGroups(t, tn)

		// Action
		res, err := tn.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), member.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot add user to group: OIDC group membership mapping is enabled")
		require.Empty(t, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse removing a user by hand when OIDC manages group memberships", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		oidcManagedGroups(t, tn)

		// Action
		res, err := tn.Admin.API.RemoveUserFromGroupWithResponse(t.Context(), group.ID.String(), member.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot remove user from group: OIDC group membership mapping is enabled")
		require.Equal(t, []string{member.Email}, groupUsernames(t, tn, group.ID))
	})

	t.Run("should still add a machine identity when OIDC manages group memberships", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)
		oidcManagedGroups(t, tn)

		// Action
		res, err := tn.Admin.API.AddMachineIdentityToGroupWithResponse(t.Context(), group.ID.String(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{identity.ID}, groupIdentityIDs(t, tn, group.ID))
	})

	t.Run("should remove group-derived project access when a user leaves the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		proj.GrantGroup(t, group, "viewer")
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, member.API, proj.ID) })

		// Action
		group.RemoveUser(t, member)

		// Assert
		body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return listSecrets(t, member.API, proj.ID) })
		require.Contains(t, string(body), "You are not a member of this project")
	})

	t.Run("should keep a user's direct project access when they leave the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		member := proj.NewUser(t, fixture.WithRoles("viewer"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		proj.GrantGroup(t, group, "member")
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return createSecret(t, member.API, proj.ID, "BEFORE") })

		// Action
		group.RemoveUser(t, member)

		// Assert
		waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return createSecret(t, member.API, proj.ID, "AFTER_"+id.Short()) })
		status, body := listSecrets(t, member.API, proj.ID)
		requireStatus(t, http.StatusOK, status, body)
		require.Contains(t, string(body), "EXISTING")
	})
}
