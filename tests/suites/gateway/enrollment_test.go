package gateway_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestGatewayEnrollment_Token(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should mint a gwe_ token that expires in an hour", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)

		// Action
		res, err := tn.Admin.API.MintGatewayEnrollmentTokenWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.True(t, strings.HasPrefix(res.JSON200.Token, "gwe_"), "token %q", res.JSON200.Token)
		require.WithinDuration(t, time.Now().Add(time.Hour), res.JSON200.ExpiresAt, 2*time.Minute)
	})

	t.Run("should log the gateway in with its enrollment token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		token := enrollmentToken(t, tn, gw.ID)

		// Action
		res := loginGateway(t, tn, token)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, gw.ID.String(), res.JSON200.GatewayId)
		require.EqualValues(t, "Bearer", res.JSON200.TokenType)
		status, body := gatewayTokenStatus(t, agent{API: tn.Client(t, res.JSON200.AccessToken)})
		requireStatus(t, http.StatusOK, status, body)
	})

	t.Run("should refuse an enrollment token that was already used", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		token := enrollmentToken(t, tn, gw.ID)
		first := loginGateway(t, tn, token)
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)

		// Action
		res := loginGateway(t, tn, token)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid enrollment token", apierr.Message(res.Body))
		status, body := gatewayTokenStatus(t, agent{API: tn.Client(t, first.JSON200.AccessToken)})
		requireStatus(t, http.StatusOK, status, body)
	})

	t.Run("should refuse a relay enrollment token at gateway login and leave it usable for the relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		newGateway(t, tn)
		relay := newRelay(t, tn)
		token := relayToken(t, tn, relay.ID)

		// Action
		res := loginGateway(t, tn, token)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Enrollment token belongs to a relay, not a gateway", apierr.Message(res.Body))
		relayLogin := loginRelay(t, tn, token)
		requireStatus(t, http.StatusOK, relayLogin.StatusCode(), relayLogin.Body)
	})

	t.Run("should refuse a token Infisical never issued", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		newGateway(t, tn)

		// Action
		res := loginGateway(t, tn, "gwe_not-a-real-token")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid enrollment token", apierr.Message(res.Body))
	})

	t.Run("should refuse minting an enrollment token for a gateway on aws auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		created := createGateway(t, tn.Admin.API, gatewayName(), awsAuth())
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		gw := decodeGateway(t, created.Body)

		// Action
		res, err := tn.Admin.API.MintGatewayEnrollmentTokenWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "not configured for token authentication")
		require.False(t, getGateway(t, tn, gw.ID).CanRevoke)
	})
}

func TestGatewayEnrollment_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the gateway's access token on its next request once the gateway is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res, err := tn.Admin.API.RevokeGatewayAccessWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		status, body := gatewayTokenStatus(t, running)
		requireStatus(t, http.StatusUnauthorized, status, body)
		require.Equal(t, "Gateway token has been revoked", apierr.Message(body))
	})

	t.Run("should refuse an unused enrollment token once the gateway is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		token := enrollmentToken(t, tn, gw.ID)

		// Action
		res, err := tn.Admin.API.RevokeGatewayAccessWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		login := loginGateway(t, tn, token)
		requireStatus(t, http.StatusBadRequest, login.StatusCode(), login.Body)
		require.Equal(t, "Invalid enrollment token", apierr.Message(login.Body))
	})
}

func TestGatewayEnrollment_Remint(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep the running gateway's access token valid when a new enrollment token is minted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		enrollmentToken(t, tn, gw.ID)

		// Assert
		status, body := gatewayTokenStatus(t, running)
		requireStatus(t, http.StatusOK, status, body)
	})

	t.Run("should cut off the running gateway's access token once the new enrollment token is used", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)
		token := enrollmentToken(t, tn, gw.ID)

		// Action
		res := loginGateway(t, tn, token)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		status, body := gatewayTokenStatus(t, running)
		requireStatus(t, http.StatusUnauthorized, status, body)
		status, body = gatewayTokenStatus(t, agent{API: tn.Client(t, res.JSON200.AccessToken)})
		requireStatus(t, http.StatusOK, status, body)
	})

	t.Run("should refuse an earlier unused enrollment token once a new one is minted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		earlier := enrollmentToken(t, tn, gw.ID)
		later := enrollmentToken(t, tn, gw.ID)

		// Action
		res := loginGateway(t, tn, earlier)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Invalid enrollment token", apierr.Message(res.Body))
		accepted := loginGateway(t, tn, later)
		requireStatus(t, http.StatusOK, accepted.StatusCode(), accepted.Body)
	})
}

func TestGatewayEnrollment_AgentRoutes(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a user's token on gateway connect", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		relay := newRelay(t, tn)

		// Action
		res, err := tn.Admin.API.ConnectGatewayWithResponse(t.Context(), api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Nil(t, getGateway(t, tn, gw.ID).RelayID)
	})

	t.Run("should refuse a machine identity's token on gateway connect", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		relay := newRelay(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		res, err := identity.API.ConnectGatewayWithResponse(t.Context(), api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Nil(t, getGateway(t, tn, gw.ID).RelayID)
	})

	t.Run("should refuse a user's token on gateway heartbeat", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		newGateway(t, tn)

		// Action
		res, err := tn.Admin.API.GatewayHeartbeatWithBodyWithResponse(t.Context(), "application/json", strings.NewReader("{}"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	// Identity tokens are accepted on heartbeat for gateways registered under an identity,
	// so a token-enrolled gateway is simply not that identity's.
	t.Run("should answer 404 to a machine identity's heartbeat when no gateway is registered under it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		res, err := identity.API.GatewayHeartbeatWithBodyWithResponse(t.Context(), "application/json", strings.NewReader("{}"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Nil(t, getGateway(t, tn, gw.ID).HeartbeatTTL)
	})
}
