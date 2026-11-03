package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestMachineIdentity_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create the identity with the requested org role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		name := "i-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: name, OrganizationId: tn.OrgID.String(), Role: new("member"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got := getIdentity(t, tn, res.JSON200.Identity.Id).JSON200.Identity
		require.Equal(t, name, got.Identity.Name)
		require.Equal(t, "member", got.Role)
	})

	t.Run("should refuse a role the actor cannot grant and create no identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		name := "i-" + id.Short()

		// Action
		res, err := member.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: name, OrganizationId: tn.OrgID.String(), Role: new("admin"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to create identity. Permission denied: grant-privileges on identity")
		require.NotContains(t, identityNames(t, tn.Admin.API, tn.OrgID.String()), name)
	})

	t.Run("should refuse a custom org role when the plan does not include rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "auditor", fixture.Permission{Subject: "identity", Action: []string{"read"}})
		tn.SetPlan(t, license.Enterprise().Without(license.RBAC))
		name := "i-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: name, OrganizationId: tn.OrgID.String(), Role: new("auditor"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Upgrade to Infisical Enterprise to assign custom roles")
		require.NotContains(t, identityNames(t, tn.Admin.API, tn.OrgID.String()), name)
	})

	t.Run("should refuse creation past the plan's identity limit and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{})
		limited := license.Enterprise().With(license.MaxIdentityLimit, 1)
		limited.Slug = "pro"
		tn.SetPlan(t, limited)
		name := "i-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: name, OrganizationId: tn.OrgID.String(), Role: new("member"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "identity limit reached")
		require.NotContains(t, identityNames(t, tn.Admin.API, tn.OrgID.String()), name)
	})

	t.Run("should refuse a member without identity create permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "identity-reader", fixture.Permission{Subject: "identity", Action: []string{"read"}})
		reader := tn.NewMachineIdentity(t, harness.OrgRole("identity-reader"))
		name := "i-" + id.Short()

		// Action
		res, err := reader.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: name, OrganizationId: tn.OrgID.String(), Role: new("no-access"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.NotContains(t, identityNames(t, tn.Admin.API, tn.OrgID.String()), name)
	})
}

func TestMachineIdentity_RoleChange(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should apply a downgraded org role to an existing token on its next request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))
		status, body := createGroupAs(t, identity.API)
		requireStatus(t, http.StatusOK, status, body)

		// Action
		res, err := tn.Admin.API.UpdateMachineIdentityWithResponse(t.Context(), identity.ID.String(),
			api.UpdateMachineIdentityJSONRequestBody{Role: new("member")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		status, body = createGroupAs(t, identity.API)
		requireStatus(t, http.StatusForbidden, status, body)
	})

	t.Run("should apply an upgraded org role without a new login", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		status, body := createGroupAs(t, identity.API)
		requireStatus(t, http.StatusForbidden, status, body)

		// Action
		res, err := tn.Admin.API.UpdateMachineIdentityWithResponse(t.Context(), identity.ID.String(),
			api.UpdateMachineIdentityJSONRequestBody{Role: new("admin")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return createGroupAs(t, identity.API) })
	})
}

func TestMachineIdentity_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse deleting an identity with delete protection and keep it working", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{HasDeleteProtection: new(true)})
		identity := tn.LoginWithUniversalAuth(t, identityID, "protected")

		// Action
		res, err := tn.Admin.API.DeleteMachineIdentityWithResponse(t.Context(), identityID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Identity has delete protection")
		requireWorks(t, identity.API)
	})

	t.Run("should only remove the membership when a sub-org deletes a linked root identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		identity := tn.NewMachineIdentity(t)
		linkIdentity(t, sub.Admin, identity.ID, "member")

		// Action
		res, err := sub.Admin.API.DeleteMachineIdentityWithResponse(t.Context(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotContains(t, identityNames(t, sub.Admin.API, sub.ID.String()), identity.Name)
		require.Contains(t, identityNames(t, tn.Admin.API, tn.OrgID.String()), identity.Name)
		requireWorks(t, identity.API)
	})
}

func TestMachineIdentity_OrgMembership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a token once the identity is removed from the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		linkIdentity(t, sub.Admin, ua.ID, "member")
		login := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, sub.Slug)
		requireStatus(t, http.StatusOK, login.StatusCode(), login.Body)
		inSub := tn.Client(t, login.JSON200.AccessToken)
		requireWorks(t, inSub)

		// Action
		res, err := sub.Admin.API.DeleteOrganizationIdentityMembershipWithResponse(t.Context(), ua.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) { return whoami(t, inSub) })
		require.Contains(t, string(body), "Identity is not a member of the organization")
	})

	t.Run("should answer 404 for another org's identity id, so ids cannot be probed", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner := h.NewTenant(t)
		other := h.NewTenant(t)
		identityID := createIdentity(t, owner, api.CreateMachineIdentityJSONRequestBody{Name: "original"})

		// Action
		read, err := other.Admin.API.GetMachineIdentityByIdWithResponse(t.Context(), identityID.String())
		require.NoError(t, err)
		update, err := other.Admin.API.UpdateMachineIdentityWithResponse(t.Context(), identityID.String(),
			api.UpdateMachineIdentityJSONRequestBody{Name: new("renamed")})
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusNotFound, read.StatusCode(), read.Body)
		requireStatus(t, http.StatusNotFound, update.StatusCode(), update.Body)
		require.Equal(t, "original", getIdentity(t, owner, identityID).JSON200.Identity.Identity.Name)
	})

	t.Run("should refuse a project-managed identity being edited at org level", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithPrincipalName("project-owned"))

		// Action
		res, err := tn.Admin.API.UpdateMachineIdentityWithResponse(t.Context(), identity.ID.String(),
			api.UpdateMachineIdentityJSONRequestBody{Name: new("renamed")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Identity is managed by project")
		require.Equal(t, "project-owned", projectIdentityName(t, proj, identity.ID.String()))
	})
}

// createGroupAs is an org action the admin role grants and the member role does not, so
// it shows which org role a token currently carries.
func createGroupAs(t *testing.T, c *api.ClientWithResponses) (int, []byte) {
	t.Helper()
	res, err := c.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: "g-" + id.Short()})
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func projectIdentityName(t *testing.T, proj *fixture.Project, identityID string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetProjectMachineIdentityByIdWithResponse(t.Context(), proj.ID, identityID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading project identity returned %d: %s", res.StatusCode(), res.Body)
	return res.JSON200.Identity.Name
}
