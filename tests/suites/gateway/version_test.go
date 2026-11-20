package gateway_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGateway_Version(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record the version a gateway reports when it connects and return it from get and list", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		gw := newGateway(t, tn)
		neverConnected := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res, err := running.API.ConnectGatewayWithResponse(t.Context(),
			api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name}, withUserAgent("cli/0.45.6"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got := getGateway(t, tn, gw.ID)
		require.Equal(t, ptr("0.45.6"), got.CliVersion)
		require.NotNil(t, got.CliVersionReportedAt)
		require.Equal(t, ptr("0.45.6"), listedCliVersion(t, tn, gw.ID))
		untouched := getGateway(t, tn, neverConnected.ID)
		require.Nil(t, untouched.CliVersion)
		require.Nil(t, untouched.CliVersionReportedAt)
	})

	t.Run("should record the version from a heartbeat even when the health probe fails", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw, running := connectWithVersion(t, tn, "0.45.6")

		// Action
		res := gatewayHeartbeat(t, running, withUserAgent("cli/0.45.11"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, ptr("0.45.11"), getGateway(t, tn, gw.ID).CliVersion)
	})

	t.Run("should clear the version and keep a report time when a heartbeat comes from a CLI too old to report one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw, running := connectWithVersion(t, tn, "0.45.6")

		// Action
		res := gatewayHeartbeat(t, running, withUserAgent("cli"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		got := getGateway(t, tn, gw.ID)
		require.Nil(t, got.CliVersion)
		require.NotNil(t, got.CliVersionReportedAt)
	})

	t.Run("should store nothing and answer the heartbeat as usual when the user agent is not a CLI version", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw, running := connectWithVersion(t, tn, "0.45.6")
		usual := gatewayHeartbeat(t, running, withUserAgent("cli/0.45.6"))
		requireStatus(t, http.StatusBadRequest, usual.StatusCode(), usual.Body)

		for _, ua := range []string{"curl/8.7.1", "cli/1.2.3-SNAPSHOT-" + strings.Repeat("a", 2000)} {
			// Action
			res := gatewayHeartbeat(t, running, withUserAgent(ua))

			// Assert
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equal(t, apierr.Message(usual.Body), apierr.Message(res.Body))
			got := getGateway(t, tn, gw.ID)
			require.Nil(t, got.CliVersion, "user agent %.40s", ua)
			require.Nil(t, got.CliVersionReportedAt, "user agent %.40s", ua)
		}
	})

	t.Run("should keep the reported version when a user triggers a health check", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw, _ := connectWithVersion(t, tn, "0.45.6")

		// Action
		res, err := tn.Admin.API.TriggerGatewayHeartbeatWithResponse(t.Context(), gw.ID.String(), withUserAgent("cli/9.9.9"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, ptr("0.45.6"), getGateway(t, tn, gw.ID).CliVersion)
	})

	// A legacy gateway registers and heartbeats with its machine identity's token, through an upsert
	// rather than the token-gateway update, so it gets its own check.
	t.Run("should record the version of an identity-bound gateway when it registers and when it heartbeats", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		reg, err := identity.API.RegisterGatewayWithResponse(t.Context(),
			api.RegisterGatewayJSONRequestBody{Name: gatewayName(), RelayName: &relay.Name}, withUserAgent("cli/0.45.6"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, reg.StatusCode(), reg.Body)
		gatewayID := uuid.MustParse(reg.JSON200.GatewayId)
		require.Equal(t, ptr("0.45.6"), getGateway(t, tn, gatewayID).CliVersion)

		// Action
		hb, err := identity.API.GatewayHeartbeatWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{}), withUserAgent("cli/0.45.11"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, hb.StatusCode(), hb.Body)
		require.Equal(t, ptr("0.45.11"), getGateway(t, tn, gatewayID).CliVersion)
	})
}

// withUserAgent replaces the harness's own user agent for one call, as a gateway running the
// Infisical CLI sends cli/<version>.
func withUserAgent(ua string) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.Header.Set("User-Agent", ua)
		return nil
	}
}

// connectWithVersion enrolls a new gateway and connects it through a new relay, reporting version.
func connectWithVersion(t *testing.T, tn *harness.Tenant, version string) (gatewayView, agent) {
	t.Helper()
	relay := newRelay(t, tn)
	gw := newGateway(t, tn)
	running := enrollGateway(t, tn, gw.ID)
	res, err := running.API.ConnectGatewayWithResponse(t.Context(),
		api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name}, withUserAgent("cli/"+version))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	require.Equal(t, ptr(version), getGateway(t, tn, gw.ID).CliVersion)
	return gw, running
}

func gatewayHeartbeat(t *testing.T, gw agent, editors ...api.RequestEditorFn) *api.GatewayHeartbeatResponse {
	t.Helper()
	res, err := gw.API.GatewayHeartbeatWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{}), editors...)
	require.NoError(t, err)
	return res
}

// listedCliVersion reads the list body by hand: the generated list type predates cliVersion.
func listedCliVersion(t *testing.T, tn *harness.Tenant, gatewayID uuid.UUID) *string {
	t.Helper()
	res, err := tn.Admin.API.ListGatewaysWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var listed []struct {
		ID         uuid.UUID `json:"id"`
		CliVersion *string   `json:"cliVersion"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &listed))
	for _, g := range listed {
		if g.ID == gatewayID {
			return g.CliVersion
		}
	}
	require.Failf(t, "gateway not listed", "gateway %s, body: %s", gatewayID, apierr.Body(res.Body))
	return nil
}

func ptr(s string) *string { return &s }
