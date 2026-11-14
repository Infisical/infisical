package organization_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

var emailDomainsRead = fixture.Permission{Subject: "email-domains", Action: []string{"read"}}

func TestOrgRole_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create, read by slug and list a custom role alongside admin, member and no-access", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res := createOrgRole(t, tn.Admin.API, "domain-reader", emailDomainsRead)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got, err := tn.Admin.API.GetOrganizationRoleBySlugWithResponse(t.Context(), "domain-reader")
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, res.JSON200.Role.Id, got.JSON200.Role.Id)
		require.Equal(t, []fixture.Permission{emailDomainsRead}, rolePermissions(t, got.Body))
		require.Subset(t, orgRoleSlugs(t, tn), []string{"admin", "member", "no-access", "domain-reader"})
	})

	t.Run("should refuse a reserved slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		before := orgRoleSlugs(t, tn)

		// Action
		res := createOrgRole(t, tn.Admin.API, "admin", emailDomainsRead)

		// Assert
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "the slug you have entered is reserved")
		require.Equal(t, before, orgRoleSlugs(t, tn))
	})

	t.Run("should refuse a duplicate slug and keep the original", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		original := fixture.NewOrgRole(t, tn, "domain-reader", emailDomainsRead)

		// Action
		res := createOrgRole(t, tn.Admin.API, "domain-reader", fixture.Permission{Subject: "member", Action: []string{"read"}})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Role with domain-reader already exists")
		got, err := tn.Admin.API.GetOrganizationRoleBySlugWithResponse(t.Context(), "domain-reader")
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, original, got.JSON200.Role.Id.String())
		require.Equal(t, []fixture.Permission{emailDomainsRead}, rolePermissions(t, got.Body))
	})

	t.Run("should refuse create when the plan lacks rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))

		// Action
		res := createOrgRole(t, tn.Admin.API, "domain-reader", emailDomainsRead)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to create custom role due to plan RBAC restriction")
		require.NotContains(t, orgRoleSlugs(t, tn), "domain-reader")
	})
}

func TestOrgRole_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse update when the plan lacks rbac and keep the rules", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		roleID := fixture.NewOrgRole(t, tn, "domain-reader", emailDomainsRead)
		tn.SetPlan(t, license.Enterprise().Without(license.RBAC))
		body, err := json.Marshal(map[string]any{"permissions": []fixture.Permission{{Subject: "member", Action: []string{"read"}}}})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.UpdateOrganizationRoleWithBodyWithResponse(t.Context(), roleID, "application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to update custom role due to plan RBAC restriction")
		got, err := tn.Admin.API.GetOrganizationRoleBySlugWithResponse(t.Context(), "domain-reader")
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, []fixture.Permission{emailDomainsRead}, rolePermissions(t, got.Body))
	})

	t.Run("should keep an assigned custom role working after the plan loses rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reader := customRoleUser(t, tn, "domain-reader", emailDomainsRead)

		// Action
		tn.SetPlan(t, license.Enterprise().Without(license.RBAC))

		// Assert
		res, err := reader.API.ListEmailDomainsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	})
}

func TestOrgRole_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse deleting a role assigned to a member and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		roleID := fixture.NewOrgRole(t, tn, "domain-reader", emailDomainsRead)
		tn.NewUser(t, harness.OrgRole("domain-reader"))

		// Action
		res, err := tn.Admin.API.DeleteOrganizationRoleWithResponse(t.Context(), roleID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Role is assigned to 1")
		require.Contains(t, orgRoleSlugs(t, tn), "domain-reader")
	})

	t.Run("should refuse deleting a role used by an external group mapping and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		roleID := fixture.NewOrgRole(t, tn, "domain-reader", emailDomainsRead)
		var mapping api.UpdateExternalGroupOrgRoleMappingsJSONRequestBody
		mapping.Mappings = append(mapping.Mappings, struct {
			GroupName string `json:"groupName"`
			RoleSlug  string `json:"roleSlug"`
		}{GroupName: "engineering", RoleSlug: "domain-reader"})
		mapped, err := tn.Admin.API.UpdateExternalGroupOrgRoleMappingsWithResponse(t.Context(), mapping)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, mapped.StatusCode(), mapped.Body)

		// Action
		res, err := tn.Admin.API.DeleteOrganizationRoleWithResponse(t.Context(), roleID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot delete role assigned to external group organization role mapping")
		require.Contains(t, orgRoleSlugs(t, tn), "domain-reader")
	})
}

func TestOrgRole_Permissions(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a custom role read what it grants", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reader := customRoleUser(t, tn, "domain-reader", emailDomainsRead)

		// Action
		res, err := reader.API.ListEmailDomainsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	})

	t.Run("should refuse a custom role an action on a subject it grants only read on, and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reader := customRoleUser(t, tn, "domain-reader", emailDomainsRead)

		// Action
		res, err := reader.API.CreateEmailDomainWithResponse(t.Context(), api.CreateEmailDomainJSONRequestBody{Domain: "acme-" + tn.OrgSlug + ".test"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		domains, err := tn.Admin.API.ListEmailDomainsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, domains.StatusCode(), domains.Body)
		require.Empty(t, domains.JSON200.EmailDomains)
	})

	t.Run("should refuse a custom role a subject it does not grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reader := customRoleUser(t, tn, "domain-reader", emailDomainsRead)

		// Action
		res, err := reader.API.ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	t.Run("should let a deny rule from a group's role override an allow from the member's own role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		user := customRoleUser(t, tn, "conn-reader",
			fixture.Permission{Subject: "app-connections", Action: []string{"read"}})
		fixture.NewOrgRole(t, tn, "conn-denied",
			fixture.Permission{Subject: "app-connections", Action: []string{"read"}, Inverted: true})
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("conn-denied"))
		allowed, err := user.API.ListGitHubAppConnectionsWithResponse(t.Context(), nil)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, allowed.StatusCode(), allowed.Body)

		// Action
		group.AddUser(t, user)

		// Assert
		res, err := user.API.ListGitHubAppConnectionsWithResponse(t.Context(), nil)
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	t.Run("should report the caller's org role and rules from GET /organization/permissions", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reader := customRoleUser(t, tn, "domain-reader", emailDomainsRead)

		// Action
		res, err := reader.API.GetOrganizationPermissionsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Memberships, 1)
		require.Equal(t, "custom", res.JSON200.Memberships[0].Roles[0].Role)
		require.Equal(t, map[string][]string{"email-domains": {"read"}}, packedRules(t, res.JSON200.Permissions))
	})
}

// rolePermissions reads a role's rules back in the shape they were sent.
func rolePermissions(t *testing.T, body []byte) []fixture.Permission {
	t.Helper()
	var out struct {
		Role struct {
			Permissions []fixture.Permission `json:"permissions"`
		} `json:"role"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	return out.Role.Permissions
}
