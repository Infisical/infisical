package billing_test

import (
	"crypto/rand"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

// instanceAdmin is the instance's root user signed into the root organization: a human
// session, which the billing routes require, that isSuperAdmin accepts.
func instanceAdmin(t *testing.T, h *harness.Stack, tn *harness.Tenant) *api.ClientWithResponses {
	t.Helper()
	res, err := tn.Anonymous(t, infisical.ForwardedFor(sourceIP())).LoginV3WithResponse(t.Context(),
		api.LoginV3JSONRequestBody{Email: infisical.RootEmail, Password: infisical.RootPassword})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ip := sourceIP()
	unscoped := tn.Client(t, res.JSON200.AccessToken, infisical.ForwardedFor(ip))
	orgs, err := h.InstanceAdmin(t).API.ListAdminOrganizationsWithResponse(t.Context(),
		&api.ListAdminOrganizationsParams{SearchTerm: new(infisical.RootOrgName)})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, orgs.StatusCode(), orgs.Body)
	require.Len(t, orgs.JSON200.Organizations, 1)
	selected, err := unscoped.SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgs.JSON200.Organizations[0].Id.String()})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, selected.StatusCode(), selected.Body)
	return tn.Client(t, selected.JSON200.Token, infisical.ForwardedFor(ip))
}

func TestSelfHostedBilling_Read(t *testing.T) {
	h := harness.From(t)

	t.Run("should show an organization's admin a read-only, managed view of their own billing", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.False(t, res.JSON200.Overview.IsCloud)
		require.EqualValues(t, "managed", res.JSON200.Overview.Mode)
		require.Nil(t, res.JSON200.Overview.Payment)
		require.Empty(t, res.JSON200.Overview.Invoices)
	})

	t.Run("should let the instance admin read another organization's overview and breakdown", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tn.NewMachineIdentity(t)
		admin := instanceAdmin(t, h, tn)

		// Action
		overview, err := admin.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		breakdown, err := admin.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, overview.StatusCode(), overview.Body)
		require.EqualValues(t, "managed", overview.JSON200.Overview.Mode)
		requireStatus(t, http.StatusOK, breakdown.StatusCode(), breakdown.Body)
		require.EqualValues(t, 1, breakdown.JSON200.Breakdown.Total)
		require.Equal(t, tn.OrgID.String(), breakdown.JSON200.Breakdown.Scopes[0].OrgId)
	})

	t.Run("should refuse another organization's admin the same reads", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)

		// Action
		overview, err := other.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		breakdown, err := other.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{})

		// Assert
		require.NoError(t, err)
		require.Contains(t, []int{http.StatusForbidden, http.StatusNotFound}, overview.StatusCode())
		require.Contains(t, []int{http.StatusForbidden, http.StatusNotFound}, breakdown.StatusCode())
	})

	t.Run("should list every organization on the instance to the instance admin, and only their own to an organization admin", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		admin := instanceAdmin(t, h, tn)

		// Action
		all, err := admin.ListBillableOrganizationsWithResponse(t.Context(), tn.OrgID, &api.ListBillableOrganizationsParams{Limit: new(1000)})
		require.NoError(t, err)
		own, err := tn.Admin.API.ListBillableOrganizationsWithResponse(t.Context(), tn.OrgID, &api.ListBillableOrganizationsParams{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, all.StatusCode(), all.Body)
		ids := map[string]bool{}
		for _, o := range all.JSON200.Organizations {
			ids[o.Id] = true
		}
		require.True(t, ids[tn.OrgID.String()])
		require.True(t, ids[other.OrgID.String()])
		requireStatus(t, http.StatusOK, own.StatusCode(), own.Body)
		require.Len(t, own.JSON200.Organizations, 1)
		require.Equal(t, tn.OrgID.String(), own.JSON200.Organizations[0].Id)
	})

	t.Run("should let the instance admin read the instance-wide breakdown, and refuse an organization admin", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		tn.NewMachineIdentity(t)
		admin := instanceAdmin(t, h, tn)
		instance := api.GetBillingUsageBreakdownParamsScopeInstance
		params := &api.GetBillingUsageBreakdownParams{Scope: &instance}

		// Action
		byAdmin, err := admin.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), params)
		require.NoError(t, err)
		byOrgAdmin, err := tn.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), params)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, byAdmin.StatusCode(), byAdmin.Body)
		require.GreaterOrEqual(t, byAdmin.JSON200.Breakdown.Total, float32(1))
		requireStatus(t, http.StatusForbidden, byOrgAdmin.StatusCode(), byOrgAdmin.Body)
	})
}

func TestSelfHostedBilling_Mutate(t *testing.T) {
	h := harness.From(t)

	t.Run("should refuse the instance admin a change to another organization's billing, and send nothing", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		admin := instanceAdmin(t, h, tn)
		key := license.Open(t, fixture.FakenetAdmin(t, tn), licenseKey)

		// Action
		res, err := admin.CreateBillingPortalSessionWithResponse(t.Context(), tn.OrgID.String(), api.CreateBillingPortalSessionJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		for _, c := range key.Calls(t) {
			require.NotContains(t, c.Path, "/billing/portal-session")
		}
	})
}
