package gateway_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// The image under test ships the Infisical CLI, so the agents run the build a customer
// would pair with this server.
const agentImage = "infisical-test:local"

// agentDomain is where the agents reach Infisical: its container on the shared network,
// over plain http, which is what the server listens on.
func agentDomain(h *harness.Stack) string { return h.App().BaseURL(infra.Internal) }

// startRelay runs a relay agent whose recorded host is its own container's address.
func startRelay(t *testing.T, h *harness.Stack, tn *harness.Tenant) relayView {
	t.Helper()
	name := relayName()
	res := createRelay(t, tn.Admin.API, name, name)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	relay := relayView{ID: res.JSON200.Id, Name: name, Host: name}
	h.RunContainer(t, "relay", infra.ContainerSpec{
		Image: agentImage,
		Alias: name,
		Command: []string{"infisical", "relay", "start", "--telemetry=false",
			"--name=" + name, "--enroll-method=token", "--token=" + relayToken(t, tn, relay.ID),
			"--domain=" + agentDomain(h)},
	})
	return relay
}

// startGateway runs a gateway agent for an existing token-auth gateway, through relay.
func startGateway(t *testing.T, h *harness.Stack, tn *harness.Tenant, gw gatewayView, relay relayView) *harness.TestContainer {
	t.Helper()
	return h.RunContainer(t, "gateway", infra.ContainerSpec{
		Image: agentImage,
		Command: []string{"infisical", "gateway", "start", gw.Name, "--telemetry=false",
			"--enroll-method=token", "--token=" + enrollmentToken(t, tn, gw.ID),
			"--domain=" + agentDomain(h), "--target-relay-name=" + relay.Name},
	})
}

func waitHealthy(t *testing.T, tn *harness.Tenant, gatewayID uuid.UUID) gatewayView {
	t.Helper()
	var gw gatewayView
	wait.Until(t, "the gateway to record a heartbeat", func() bool {
		gw = getGateway(t, tn, gatewayID)
		return gw.Heartbeat != nil
	})
	return gw
}

// healthyGateway is a token-auth gateway whose agent is connected through relay.
func healthyGateway(t *testing.T, h *harness.Stack, tn *harness.Tenant, relay relayView) (gatewayView, *harness.TestContainer) {
	t.Helper()
	gw := newGateway(t, tn)
	c := startGateway(t, h, tn, gw, relay)
	waitHealthy(t, tn, gw.ID)
	return gw, c
}

// dynamicSecret is a Postgres dynamic secret on the target that Infisical reaches
// through route, a {"gatewayId": ...} or {"gatewayPoolId": ...} pair.
type dynamicSecret struct {
	name string
	proj *fixture.Project
}

func createDynamicSecret(t *testing.T, tn *harness.Tenant, target *fixture.PostgresTarget, route map[string]any) (*api.CreateDynamicSecretResponse, dynamicSecret) {
	t.Helper()
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	inputs := map[string]any{
		"client":              "postgres",
		"host":                target.Host,
		"port":                target.Port,
		"database":            target.Database,
		"username":            target.User,
		"password":            target.Password,
		"creationStatement":   `CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';`,
		"revocationStatement": `DROP ROLE "{{username}}";`,
	}
	for k, v := range route {
		inputs[k] = v
	}
	ds := dynamicSecret{name: "ds-" + id.Short(), proj: proj}
	res, err := tn.Admin.API.CreateDynamicSecretWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{
		"projectSlug":     proj.Slug,
		"environmentSlug": "dev",
		"path":            "/",
		"name":            ds.name,
		"provider":        map[string]any{"type": "sql-database", "inputs": inputs},
		"defaultTTL":      "1h",
	}))
	require.NoError(t, err)
	return res, ds
}

func (d dynamicSecret) lease(t *testing.T) *api.CreateDynamicSecretLeaseResponse {
	t.Helper()
	path := "/"
	res, err := d.proj.Tenant().Admin.API.CreateDynamicSecretLeaseWithResponse(t.Context(), api.CreateDynamicSecretLeaseJSONRequestBody{
		DynamicSecretName: d.name, ProjectSlug: d.proj.Slug, EnvironmentSlug: "dev", Path: &path,
	})
	require.NoError(t, err)
	return res
}

func leasedUsername(t *testing.T, res *api.CreateDynamicSecretLeaseResponse) (string, string) {
	t.Helper()
	data, _ := res.JSON200.Data.(map[string]any)
	username, _ := data["DB_USERNAME"].(string)
	password, _ := data["DB_PASSWORD"].(string)
	require.NotEmpty(t, username, "the lease carries no DB_USERNAME: %v", data)
	return username, password
}

func TestGatewayForwarding_Health(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should show the gateway healthy with a fresh heartbeat once its agent connects through the relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := startRelay(t, h, tn)
		gw := newGateway(t, tn)

		// Action
		startGateway(t, h, tn, gw, relay)

		// Assert
		healthy := waitHealthy(t, tn, gw.ID)
		require.WithinDuration(t, time.Now(), *healthy.Heartbeat, time.Minute)
		require.NotNil(t, healthy.HeartbeatTTL)
		require.Positive(t, *healthy.HeartbeatTTL)
		require.Equal(t, relay.ID, *healthy.RelayID)
	})
}

func TestGatewayForwarding_DynamicSecret(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should lease a postgres dynamic secret through the gateway and create the role on the target", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		gw, _ := healthyGateway(t, h, tn, startRelay(t, h, tn))
		created, ds := createDynamicSecret(t, tn, target, map[string]any{"gatewayId": gw.ID})
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)

		// Action
		res := ds.lease(t)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		username, password := leasedUsername(t, res)
		target.DropRoleAtCleanup(t, username)
		require.True(t, target.RoleExists(t, username))
		require.NoError(t, target.Login(t, username, password))
	})

	t.Run("should fail the lease once the gateway's agent stops", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		gw, agentContainer := healthyGateway(t, h, tn, startRelay(t, h, tn))
		created, ds := createDynamicSecret(t, tn, target, map[string]any{"gatewayId": gw.ID})
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		agentContainer.Stop(t)

		// Action
		res := ds.lease(t)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
	})
}

func TestGatewayForwarding_Pool(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// pooled is a pool of two healthy gateways sharing one relay.
	pooled := func(t *testing.T, tn *harness.Tenant) (uuid.UUID, []*harness.TestContainer, []uuid.UUID) {
		t.Helper()
		relay := startRelay(t, h, tn)
		poolID := newPool(t, tn)
		var agents []*harness.TestContainer
		var ids []uuid.UUID
		for range 2 {
			gw, c := healthyGateway(t, h, tn, relay)
			added := addToPool(t, tn.Admin.API, poolID, gw.ID)
			requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)
			agents = append(agents, c)
			ids = append(ids, gw.ID)
		}
		return poolID, agents, ids
	}

	t.Run("should fail over to the healthy member when one member's agent is stopped", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		poolID, agents, _ := pooled(t, tn)
		agents[0].Stop(t)

		// Action
		var statuses []int
		for range 4 {
			res := createPostgresConnection(t, tn.Admin.API, target, map[string]any{"gatewayPoolId": poolID})
			statuses = append(statuses, res.StatusCode())
		}

		// Assert
		require.Equal(t, []int{http.StatusOK, http.StatusOK, http.StatusOK, http.StatusOK}, statuses)
	})

	t.Run("should answer that the pool has no healthy gateways when every member is down", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		poolID, agents, ids := pooled(t, tn)
		for i, c := range agents {
			c.Stop(t)
			probed, err := tn.Admin.API.TriggerGatewayHeartbeatWithResponse(t.Context(), ids[i].String())
			require.NoError(t, err)
			requireStatus(t, http.StatusBadRequest, probed.StatusCode(), probed.Body)
		}

		// Action
		res := createPostgresConnection(t, tn.Admin.API, target, map[string]any{"gatewayPoolId": poolID})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Gateway pool has no healthy gateways.", apierr.Message(res.Body))
	})
}

// Revoking is documented to disconnect the running gateway, but Infisical keeps handing
// out connection details for it, and the agent keeps proxying on its open tunnel until
// it notices its own token was refused (about 30 seconds here). Leases issued in that
// window reach the target through a revoked gateway.
func TestGatewayForwarding_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a lease through a gateway as soon as it is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		gw, _ := healthyGateway(t, h, tn, startRelay(t, h, tn))
		created, ds := createDynamicSecret(t, tn, target, map[string]any{"gatewayId": gw.ID})
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		revoked, err := tn.Admin.API.RevokeGatewayAccessWithResponse(t.Context(), gw.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, revoked.StatusCode(), revoked.Body)

		// Action
		res := ds.lease(t)

		// Assert
		if res.StatusCode() == http.StatusOK {
			username, _ := leasedUsername(t, res)
			target.DropRoleAtCleanup(t, username)
		}
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
	})
}
