package organization_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestOrganization_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a read when the organization belongs to another tenant", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The claim the Shared profile rests on: if one tenant can reach
			another's organization, parallel tests against one instance are unsound.`)

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)

		// Action
		res, err := mine.Admin.API.GetOrganizationPlanWithResponse(t.Context(), theirs.OrgID.String(), nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "belongs to a different organization")
	})

	t.Run("should refuse a read when the organization does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetOrganizationPlanWithResponse(t.Context(), uuid.NewString(), nil)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "belongs to a different organization")
	})

	t.Run("should make the creator admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		creator := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := creator.API.CreateOrganizationWithResponse(t.Context(), api.CreateOrganizationJSONRequestBody{Name: "second"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		orgID := res.JSON200.Organization.Id
		scoped := selectOrg(t, tn, creator, orgID)
		t.Cleanup(func() {
			_, _ = scoped.DeleteOrganizationWithResponse(context.WithoutCancel(t.Context()), orgID.String())
		})
		perms, err := scoped.GetOrganizationPermissionsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, perms.StatusCode(), perms.Body)
		require.Len(t, perms.JSON200.Memberships, 1)
		require.Equal(t, "admin", perms.JSON200.Memberships[0].Roles[0].Role)
	})

	t.Run("should refuse a second root org for the same user on cloud", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateOrganizationWithResponse(t.Context(), api.CreateOrganizationJSONRequestBody{Name: "second"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusConflict, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You have already created an organization")
		orgs, err := tn.Admin.API.ListUserOrganizationsWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, orgs.StatusCode(), orgs.Body)
		require.Len(t, orgs.JSON200.Organizations, 1)
	})
}

func TestOrganization_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a settings edit without settings edit, and keep the name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		before := orgOf(t, tn)

		// Action
		res, err := member.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{Name: new("renamed")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, before.Name, orgOf(t, tn).Name)
	})

	t.Run("should refuse a slug another org holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{Slug: &other.OrgSlug})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Organization with slug "+other.OrgSlug+" already exists")
		require.Equal(t, tn.OrgSlug, orgOf(t, tn).Slug)
	})

	t.Run("should refuse an invalid userTokenExpiration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{UserTokenExpiration: new("0d")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Duration value must be at least 1")
	})

	t.Run("should refuse a custom default membership role when the plan lacks rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "reader", fixture.Permission{Subject: "member", Action: []string{"read"}})
		tn.SetPlan(t, license.Enterprise().Without(license.RBAC))

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{DefaultMembershipRoleSlug: new("reader")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to set custom default role due to plan RBAC restriction")
		require.Equal(t, "member", orgOf(t, tn).DefaultMembershipRole)
	})

	t.Run("should give new invitees the default membership role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{DefaultMembershipRoleSlug: new("no-access")})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		addr := tn.Email("newcomer")

		// Action
		invited, err := tn.Admin.API.InviteProjectMembersWithResponse(t.Context(), proj.ID,
			api.InviteProjectMembersJSONRequestBody{Emails: &[]openapi_types.Email{openapi_types.Email(addr)}})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, invited.StatusCode(), invited.Body)
		m := fixture.MembershipOf(t, tn, addr)
		require.NotNil(t, m)
		require.Equal(t, "no-access", m.Role)
	})

	t.Run("should refuse SSO enforcement before a successful OIDC login", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sso.NewOIDC(t, tn)

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "please log in via OIDC at least once")
		require.False(t, orgOf(t, tn).AuthEnforced)
	})

	t.Run("should refuse SAML and Google enforcement together", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{AuthEnforced: new(true), GoogleSsoAuthEnforced: new(true)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body),
			"SAML/OIDC auth enforcement and Google SSO auth enforcement cannot be enabled at the same time")
		after := orgOf(t, tn)
		require.False(t, after.AuthEnforced)
		require.False(t, after.GoogleSsoAuthEnforced)
	})
}

func TestOrganization_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a non-admin and keep the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.DeleteOrganizationWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, tn.OrgSlug, orgOf(t, tn).Slug)
	})

	t.Run("should delete the org and refuse its members' tokens on its routes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))
		before, err := member.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, before.StatusCode(), before.Body)

		// Action
		res, err := tn.Admin.API.DeleteOrganizationWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		after, err := member.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, after.StatusCode(), after.Body)
		require.Contains(t, string(after.Body), "no longer exists")
		members, err := member.API.ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, members.StatusCode(), members.Body)
	})
}

// selectOrg scopes p's session to another organization p belongs to.
func selectOrg(t *testing.T, tn *harness.Tenant, p *harness.Principal, orgID uuid.UUID) *api.ClientWithResponses {
	t.Helper()
	res, err := p.API.SelectOrganizationV3WithResponse(t.Context(), api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgID.String()})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return tn.Client(t, res.JSON200.Token)
}
