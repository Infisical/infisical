package gateway_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const poolUpgradeMessage = "Your current plan does not support gateway pools. Please upgrade to an Enterprise plan."

func withoutPools() license.Plan { return license.Enterprise().Without(license.GatewayPool) }

func TestGatewayPool_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse creating a pool when the plan does not include gateway pools", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutPools()))

		// Action
		res, err := tn.Admin.API.CreateGatewayPoolWithResponse(t.Context(), api.CreateGatewayPoolJSONRequestBody{Name: "pool-" + id.Short()})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, poolUpgradeMessage, apierr.Message(res.Body))
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, poolIDs(t, tn))
	})

	t.Run("should refuse renaming a pool after a downgrade and keep its name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		before := poolName(t, tn, poolID)
		tn.SetPlan(t, withoutPools())

		// Action
		renamed := "renamed-" + id.Short()
		res, err := tn.Admin.API.UpdateGatewayPoolWithResponse(t.Context(), poolID, api.UpdateGatewayPoolJSONRequestBody{Name: &renamed})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, poolUpgradeMessage, apierr.Message(res.Body))
		tn.SetPlan(t, license.Enterprise())
		require.Equal(t, before, poolName(t, tn, poolID))
	})

	t.Run("should refuse adding a gateway to a pool after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		gw := newGateway(t, tn)
		tn.SetPlan(t, withoutPools())

		// Action
		res := addToPool(t, tn.Admin.API, poolID, gw.ID)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, poolUpgradeMessage, apierr.Message(res.Body))
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, poolMembers(t, tn, poolID))
	})
}

func TestGatewayPool_Membership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should add a gateway to a pool and list it as a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		gw := newGateway(t, tn)

		// Action
		res := addToPool(t, tn.Admin.API, poolID, gw.ID)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{gw.ID}, poolMembers(t, tn, poolID))
	})

	t.Run("should remove a gateway from a pool", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		kept, removed := newGateway(t, tn), newGateway(t, tn)
		for _, gw := range []gatewayView{kept, removed} {
			added := addToPool(t, tn.Admin.API, poolID, gw.ID)
			requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		}

		// Action
		res, err := tn.Admin.API.RemoveGatewayFromPoolWithResponse(t.Context(), poolID, removed.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{kept.ID}, poolMembers(t, tn, poolID))
		require.Contains(t, gatewayIDs(t, tn.Admin.API), removed.ID)
	})

	t.Run("should answer 404 when adding another organization's gateway", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		theirs := newGateway(t, h.NewTenant(t))

		// Action
		res := addToPool(t, tn.Admin.API, poolID, theirs.ID)

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Empty(t, poolMembers(t, tn, poolID))
	})
}

func TestGatewayPool_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a pool nothing uses", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)

		// Action
		res, err := tn.Admin.API.DeleteGatewayPoolWithResponse(t.Context(), poolID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, poolIDs(t, tn))
	})

	t.Run("should refuse deleting a pool an app connection routes through, naming why", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		connID := postgresConnection(t, tn)
		attached := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayPoolId: &poolID})
		requireStatus(t, http.StatusOK, attached.StatusCode(), attached.Body)

		// Action
		res, err := tn.Admin.API.DeleteGatewayPoolWithResponse(t.Context(), poolID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "referenced by one or more consumer configurations")
		require.Equal(t, []uuid.UUID{poolID}, poolIDs(t, tn))
		require.Equal(t, poolID, *connectionRouteOf(t, tn, connID).GatewayPoolID)
	})
}

func TestGatewayPool_Health(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report no healthy members for a pool of gateways that never connected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		for range 2 {
			added := addToPool(t, tn.Admin.API, poolID, newGateway(t, tn).ID)
			requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		}

		// Action
		res, err := tn.Admin.API.ListGatewayPoolsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, *res.JSON200, 1)
		require.EqualValues(t, 2, (*res.JSON200)[0].MemberCount)
		require.EqualValues(t, 0, (*res.JSON200)[0].HealthyMemberCount)
	})
}

func TestGatewayPool_RequirePools(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse attaching an individual gateway when the organization requires gateway pools", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		connID := postgresConnection(t, tn)
		requirePools(t, tn)

		// Action
		res := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayId: &gw.ID})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "requires resources to connect through a gateway pool")
		require.Nil(t, connectionRouteOf(t, tn, connID).GatewayID)
	})

	t.Run("should let a pool be attached when the organization requires gateway pools", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		connID := postgresConnection(t, tn)
		requirePools(t, tn)

		// Action
		res := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayPoolId: &poolID})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, poolID, *connectionRouteOf(t, tn, connID).GatewayPoolID)
	})

	t.Run("should refuse requiring gateway pools when the plan does not include them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(withoutPools()))

		// Action
		res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
			api.UpdateOrganizationJSONRequestBody{RequireGatewayPools: new(true)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Upgrade to Infisical Enterprise to use gateway pools")
		require.False(t, requiresPools(t, tn))
	})
}

func TestGatewayAttach_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse creating an app connection through a gateway when the plan does not include gateways", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		target := fixture.OpenPostgresTarget(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.Gateway))

		// Action
		res := createPostgresConnection(t, tn.Admin.API, target, map[string]any{"gatewayId": gw.ID})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "does not support gateway usage with app connections")
		listed, err := tn.Admin.API.ListPostgresAppConnectionsWithResponse(t.Context(), nil)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.JSONEq(t, `[]`, string(appConnectionsOf(t, listed.Body)))
	})
}

func poolIDs(t *testing.T, tn *harness.Tenant) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.ListGatewayPoolsWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []uuid.UUID{}
	for _, p := range *res.JSON200 {
		ids = append(ids, p.Id)
	}
	return ids
}

func poolName(t *testing.T, tn *harness.Tenant, poolID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.GetGatewayPoolByIdWithResponse(t.Context(), poolID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res.JSON200.Name
}

func requirePools(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{RequireGatewayPools: new(true)})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}

func requiresPools(t *testing.T, tn *harness.Tenant) bool {
	t.Helper()
	res, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res.JSON200.Organization.RequireGatewayPools != nil && *res.JSON200.Organization.RequireGatewayPools
}

// createPostgresConnection creates a connection to the target through route, a
// {"gatewayId": ...} or {"gatewayPoolId": ...} pair, or directly when route is nil.
func createPostgresConnection(t *testing.T, c *api.ClientWithResponses, target *fixture.PostgresTarget, route map[string]any) *api.CreatePostgresAppConnectionResponse {
	t.Helper()
	body := map[string]any{
		"name":   "pg-" + id.Short() + id.Short(),
		"method": "username-and-password",
		"credentials": map[string]any{
			"host":                  target.Host,
			"port":                  target.Port,
			"database":              target.Database,
			"username":              target.User,
			"password":              target.Password,
			"sslEnabled":            false,
			"sslRejectUnauthorized": false,
		},
	}
	for k, v := range route {
		body[k] = v
	}
	res, err := c.CreatePostgresAppConnectionWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, body))
	require.NoError(t, err)
	return res
}

func appConnectionsOf(t *testing.T, body []byte) json.RawMessage {
	t.Helper()
	var out struct {
		AppConnections json.RawMessage `json:"appConnections"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	return out.AppConnections
}

// Losing an entitlement makes a feature read-only (backend/CODE_QUALITY.md, License
// Checks): a downgraded organization can still see, audit and clean up its pools.
func TestGatewayPool_Downgrade(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// downgraded is an organization that built a pool with one member while entitled.
	downgraded := func(t *testing.T) (*harness.Tenant, uuid.UUID, uuid.UUID) {
		t.Helper()
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		gw := newGateway(t, tn)
		added := addToPool(t, tn.Admin.API, poolID, gw.ID)
		requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
		tn.SetPlan(t, withoutPools())
		return tn, poolID, gw.ID
	}

	t.Run("should keep listing pools after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, poolID, _ := downgraded(t)

		// Action
		res, err := tn.Admin.API.ListGatewayPoolsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, *res.JSON200, 1)
		require.Equal(t, poolID, (*res.JSON200)[0].Id)
	})

	t.Run("should keep reading a pool and its members after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, poolID, gatewayID := downgraded(t)

		// Action
		res, err := tn.Admin.API.GetGatewayPoolByIdWithResponse(t.Context(), poolID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Gateways, 1)
		require.Equal(t, gatewayID, res.JSON200.Gateways[0].Id)
	})

	t.Run("should keep showing what uses a pool after a downgrade", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, poolID, _ := downgraded(t)

		// Action
		res, err := tn.Admin.API.GetGatewayPoolConnectedResourcesWithResponse(t.Context(), poolID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	})

	t.Run("should let a downgraded organization remove a gateway from a pool", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, poolID, gatewayID := downgraded(t)

		// Action
		res, err := tn.Admin.API.RemoveGatewayFromPoolWithResponse(t.Context(), poolID, gatewayID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, poolMembers(t, tn, poolID))
	})

	t.Run("should let a downgraded organization delete a pool", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, poolID, _ := downgraded(t)

		// Action
		res, err := tn.Admin.API.DeleteGatewayPoolWithResponse(t.Context(), poolID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		tn.SetPlan(t, license.Enterprise())
		require.Empty(t, poolIDs(t, tn))
	})
}

func TestGatewayAttach_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse pointing an existing app connection at a gateway when the plan does not include gateways", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		connID := postgresConnection(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.Gateway))

		// Action
		res := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayId: &gw.ID})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "does not support gateway usage")
		require.Nil(t, connectionRouteOf(t, tn, connID).GatewayID)
	})
}

func TestGatewayPoolMembership_Duplicate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse adding a gateway that is already a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		poolID := newPool(t, tn)
		gw := newGateway(t, tn)
		first := addToPool(t, tn.Admin.API, poolID, gw.ID)
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)

		// Action
		res := addToPool(t, tn.Admin.API, poolID, gw.ID)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "This gateway is already a member of the pool.", apierr.Message(res.Body))
		require.Equal(t, []uuid.UUID{gw.ID}, poolMembers(t, tn, poolID))
	})
}
