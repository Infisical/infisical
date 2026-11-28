package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func breakdown(t *testing.T, tn *harness.Tenant, dimension string) *api.GetBillingUsageBreakdownResponse {
	t.Helper()
	res, err := tn.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
		api.GetBillingUsageBreakdownParamsDimensionKey(dimension), &api.GetBillingUsageBreakdownParams{})
	require.NoError(t, err)
	requireOK(t, res.StatusCode(), res.Body)
	return res
}

func TestBillingBreakdown_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should total members and machine identities, and split the identities by organization and project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tn.NewUser(t)
		tn.NewMachineIdentity(t)
		tn.NewMachineIdentity(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewMachineIdentity(t)

		// Action
		b := breakdown(t, tn, "identities").JSON200.Breakdown

		// Assert
		require.Equal(t, "identities", b.DimensionKey)
		require.EqualValues(t, 5, b.Total, "three machine identities and two members: the invited one and the admin, who joined a secret manager project")
		require.EqualValues(t, 2, b.UserCount)
		require.EqualValues(t, 3, b.ScopedCount)
		require.True(t, b.HasProjectDetail)
		require.Equal(t, "machine identity", b.Unit)
		require.Len(t, b.Scopes, 1)
		scope := b.Scopes[0]
		require.Equal(t, tn.OrgID.String(), scope.OrgId)
		require.True(t, scope.IsRoot)
		require.Nil(t, scope.ParentOrgName)
		require.EqualValues(t, 3, scope.Count)
		require.EqualValues(t, 2, scope.OrgLevelCount)
		require.Len(t, scope.Projects, 1)
		require.Equal(t, proj.ID, scope.Projects[0].Id)
		require.EqualValues(t, 1, scope.Projects[0].Count)
	})

	t.Run("should list a sub-organization's identities under it, after the root, naming the root as its parent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tn.NewMachineIdentity(t)
		sub := fixture.NewSubOrg(t, tn)
		created, err := sub.Admin.API.CreateMachineIdentityWithResponse(t.Context(), api.CreateMachineIdentityJSONRequestBody{
			Name: "sub-identity", OrganizationId: sub.ID.String(), Role: new("member"),
		})
		require.NoError(t, err)
		requireOK(t, created.StatusCode(), created.Body)

		// Action
		b := breakdown(t, tn, "identities").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 2, b.Total)
		require.Len(t, b.Scopes, 2)
		require.Equal(t, tn.OrgID.String(), b.Scopes[0].OrgId)
		require.EqualValues(t, 1, b.Scopes[0].Count)
		require.Equal(t, sub.ID.String(), b.Scopes[1].OrgId)
		require.False(t, b.Scopes[1].IsRoot)
		require.EqualValues(t, 1, b.Scopes[1].Count)
		require.NotNil(t, b.Scopes[1].ParentOrgName)
	})

	t.Run("should count members alone, with no scopes, for user identities", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tn.NewUser(t)
		tn.NewUser(t)
		tn.NewMachineIdentity(t)

		// Action
		b := breakdown(t, tn, "user_identities").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 2, b.Total)
		require.EqualValues(t, 2, b.UserCount)
		require.EqualValues(t, 0, b.ScopedCount)
		require.False(t, b.HasProjectDetail)
		require.Equal(t, "user identity", b.Unit)
		require.Empty(t, b.Scopes)
	})

	t.Run("should split secret manager identities by project, largest first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		small := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		small.NewMachineIdentity(t)
		large := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		large.NewMachineIdentity(t)
		large.NewMachineIdentity(t)

		// Action
		b := breakdown(t, tn, "secret_identities").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 3, b.ScopedCount)
		require.EqualValues(t, 1, b.UserCount, "the admin who created the projects is a member of them")
		require.EqualValues(t, 4, b.Total)
		require.Equal(t, "secret identity", b.Unit)
		require.Len(t, b.Scopes, 1)
		require.Len(t, b.Scopes[0].Projects, 2)
		require.Equal(t, large.ID, b.Scopes[0].Projects[0].Id)
		require.EqualValues(t, 2, b.Scopes[0].Projects[0].Count)
		require.Equal(t, small.ID, b.Scopes[0].Projects[1].Id)
		require.EqualValues(t, 1, b.Scopes[0].Projects[1].Count)
	})

	t.Run("should count only the admin, with an empty root scope and no project detail, for PAM identities of a new organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		b := breakdown(t, tn, "pam_identities").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 1, b.Total)
		require.EqualValues(t, 1, b.UserCount, "the admin is a member of the implicit PAM project")
		require.EqualValues(t, 0, b.ScopedCount)
		require.False(t, b.HasProjectDetail)
		require.Equal(t, "PAM identity", b.Unit)
		require.Len(t, b.Scopes, 1)
		require.True(t, b.Scopes[0].IsRoot)
		require.EqualValues(t, 0, b.Scopes[0].Count)
	})

	t.Run("should count the internal certificate authorities created in the organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cm := pki.CertManager(t, tn)
		pki.NewInternalCA(t, cm)
		pki.NewInternalCA(t, cm)

		// Action
		b := breakdown(t, tn, "internal_cas").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 2, b.Total)
		require.EqualValues(t, 2, b.ScopedCount)
		require.EqualValues(t, 0, b.UserCount)
		require.False(t, b.HasProjectDetail)
		require.Equal(t, "internal CA", b.Unit)
		require.Len(t, b.Scopes, 1)
		require.EqualValues(t, 2, b.Scopes[0].Count)
		require.EqualValues(t, 2, b.Scopes[0].OrgLevelCount)
		require.Empty(t, b.Scopes[0].Projects)
	})

	t.Run("should count issued certificates, and the wildcard ones among them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate("app.acme.test"))
		g.Issue(t, pki.ServerCertificate("*.acme.test"))

		// Action
		active := breakdown(t, tn, "active_certs").JSON200.Breakdown
		wildcard := breakdown(t, tn, "wildcard_certs").JSON200.Breakdown

		// Assert
		require.EqualValues(t, 2, active.Total, "the authorities' own certificates are not counted")
		require.Equal(t, "active certificate", active.Unit)
		require.Len(t, active.Scopes, 1)
		require.EqualValues(t, 2, active.Scopes[0].Count)
		require.EqualValues(t, 1, wildcard.Total)
		require.Equal(t, "wildcard certificate", wildcard.Unit)
		require.EqualValues(t, 1, wildcard.Scopes[0].Count)
	})

	t.Run("should refuse instance scope on cloud, even to an admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		instance := api.GetBillingUsageBreakdownParamsScopeInstance

		// Action
		res, err := tn.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{Scope: &instance})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "Instance-wide usage can only be read by an instance admin on a self-hosted instance.", errorOf(t, res.Body).text())
	})

	t.Run("should answer the same for the organization scope as for no scope", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tn.NewMachineIdentity(t)
		organization := api.GetBillingUsageBreakdownParamsScopeOrganization

		// Action
		explicit, err := tn.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{Scope: &organization})

		// Assert
		require.NoError(t, err)
		requireOK(t, explicit.StatusCode(), explicit.Body)
		require.JSONEq(t, string(breakdown(t, tn, "identities").Body), string(explicit.Body))
	})
}
