package suborganization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestSubOrganization_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a sub-org with its creator as admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		name := "sub-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateSubOrganizationWithResponse(t.Context(), api.CreateSubOrganizationJSONRequestBody{Name: name})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "answered %d: %s", res.StatusCode(), res.Body)
		subID := res.JSON200.Organization.Id
		selected := selectOrg(t, tn, tn.Admin.Token, subID)
		require.NotNilf(t, selected.JSON200, "selecting the sub-org answered %d: %s", selected.StatusCode(), selected.Body)
		scoped := tn.Client(t, selected.JSON200.Token)
		require.Equal(t, "admin", memberRole(t, scoped, subID, tn.Admin.ID))
		require.Equal(t, []string{name}, subOrgNames(t, tn))
	})

	t.Run("should refuse creating a sub-org from a sub-org token and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := sub.Admin.API.CreateSubOrganizationWithResponse(t.Context(), api.CreateSubOrganizationJSONRequestBody{Name: "nested"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Child organization cannot do this operation")
		require.Equal(t, []string{sub.Name}, subOrgNames(t, tn))
	})

	t.Run("should refuse creating a sub-org when the root plan lacks sub-organizations", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SubOrganization)))

		// Action
		res, err := tn.Admin.API.CreateSubOrganizationWithResponse(t.Context(), api.CreateSubOrganizationJSONRequestBody{Name: "unlicensed"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Sub-organization creation failed. Please upgrade your instance to Infisical's Enterprise plan.")
		require.Empty(t, subOrgNames(t, tn))
	})

	t.Run("should refuse a duplicate slug under the same parent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := tn.Admin.API.CreateSubOrganizationWithResponse(t.Context(), api.CreateSubOrganizationJSONRequestBody{
			Name: "another", Slug: &sub.Slug,
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), `Sub-organization with slug \"`+sub.Slug+`\" already exists`)
		require.Equal(t, []string{sub.Name}, subOrgNames(t, tn))
	})

	t.Run("should answer 400 not found for another root's sub-org and change nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		sub := fixture.NewSubOrg(t, theirs)

		// Action
		res, err := mine.Admin.API.UpdateSubOrganizationWithResponse(t.Context(), sub.ID.String(),
			api.UpdateSubOrganizationJSONRequestBody{Name: new("taken-over")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Sub-organization not found")
		require.Equal(t, []string{sub.Name}, subOrgNames(t, theirs))
	})
}

func TestSubOrganization_Join(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a root admin join a sub-org through direct access", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		admin := tn.NewUser(t, harness.OrgRole("admin"))

		// Action
		res, err := admin.API.CreateSubOrganizationMembershipWithResponse(t.Context(), sub.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "member", memberRole(t, sub.Admin.API, sub.ID, admin.ID))
	})

	t.Run("should refuse joining a sub-org without direct access and add no membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.CreateSubOrganizationMembershipWithResponse(t.Context(), sub.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to direct-access on sub-organization")
		require.NotContains(t, memberUserIDs(t, sub.Admin.API, sub.ID), member.ID)
	})

	t.Run("should refuse a second join and keep the existing role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := tn.Admin.API.CreateSubOrganizationMembershipWithResponse(t.Context(), sub.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are already a member of this sub-organization")
		require.Equal(t, "admin", memberRole(t, sub.Admin.API, sub.ID, tn.Admin.ID))
	})
}

func TestSubOrganization_Policy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a password session into a sub-org when the root enforces SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		addToSubOrg(t, sub, member, "member")
		sso.NewSAML(t, tn, sso.Okta).Enforce(t)
		session := passwordLogin(t, tn, member.Email)

		// Action
		res := selectOrg(t, tn, session, sub.ID)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Organization authentication is enforced")
	})

	t.Run("should require MFA to enter a sub-org when the root enforces it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		addToSubOrg(t, sub, member, "member")
		enforced, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{EnforceMfa: new(true)})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, enforced.StatusCode(), enforced.Body)
		session := passwordLogin(t, tn, member.Email)

		// Action
		res := selectOrg(t, tn, session, sub.ID)

		// Assert
		require.NotNilf(t, res.JSON200, "answered %d: %s", res.StatusCode(), res.Body)
		require.True(t, res.JSON200.IsMfaEnabled)
		require.Equal(t, "email", *res.JSON200.MfaMethod)
	})
}

func TestSubOrganization_Scope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a sub-org token on a sibling sub-org's members", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mine, sibling := fixture.NewSubOrg(t, tn), fixture.NewSubOrg(t, tn)

		// Action
		res, err := mine.Admin.API.ListOrgMembershipsWithResponse(t.Context(), sibling.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Your token is scoped to organization with ID "+mine.ID.String())
	})

	t.Run("should refuse a sub-org role using sso, scim, billing or sub-organization subjects", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := sub.Admin.API.CreateOrganizationRoleWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{
			"slug": "too-wide", "name": "too-wide",
			"permissions": []fixture.Permission{
				{Subject: "sso", Action: []string{"read"}},
				{Subject: "scim", Action: []string{"read"}},
				{Subject: "billing", Action: []string{"read"}},
				{Subject: "sub-organization", Action: []string{"create"}},
			},
		}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Suborganization contains invalid permission subjects: sso,scim,billing,sub-organization")
		roles, err := sub.Admin.API.ListOrganizationRolesWithResponse(t.Context())
		require.NoError(t, err)
		require.NotNil(t, roles.JSON200)
		for _, r := range roles.JSON200.Roles {
			require.NotEqual(t, "too-wide", r.Slug)
		}
	})

	t.Run("should refuse updating the organization from a sub-org token and keep its name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := sub.Admin.API.UpdateOrganizationWithResponse(t.Context(), sub.ID.String(),
			api.UpdateOrganizationJSONRequestBody{Name: new("renamed")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Child organization cannot do this operation")
		require.Equal(t, []string{sub.Name}, subOrgNames(t, tn))
	})

	t.Run("should refuse reading the external group mapping from a sub-org token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res, err := sub.Admin.API.ListExternalGroupOrgRoleMappingsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Child organization cannot do this operation")
	})
}
