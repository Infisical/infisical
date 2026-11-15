package gateway_test

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "body: %s", apierr.Body(body))
}

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

func tokenAuth() map[string]any { return map[string]any{"method": "token"} }

func awsAuth() map[string]any {
	return map[string]any{
		"method":               "aws",
		"allowedPrincipalArns": "arn:aws:iam::123456789012:role/gateway",
		"allowedAccountIds":    "",
	}
}

func gcpAuth() map[string]any {
	return map[string]any{
		"method":                 "gcp",
		"type":                   "iam",
		"allowedServiceAccounts": "gateway@project.iam.gserviceaccount.com",
		"allowedProjects":        "",
		"allowedZones":           "",
	}
}

// gatewayView is a gateway as the v3 routes return it. The auth method is a union in
// the generated client, so the body is read by hand.
type gatewayView struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	CanRevoke    bool       `json:"canRevoke"`
	RelayID      *uuid.UUID `json:"relayId"`
	Heartbeat    *time.Time `json:"heartbeat"`
	HeartbeatTTL *float64   `json:"heartbeatTTL"`
	AuthMethod   struct {
		Method string         `json:"method"`
		Config map[string]any `json:"config"`
	} `json:"authMethod"`
}

func decodeGateway(t *testing.T, body []byte) gatewayView {
	t.Helper()
	var v gatewayView
	require.NoError(t, json.Unmarshal(body, &v))
	require.NotEqual(t, uuid.Nil, v.ID, "body: %s", apierr.Body(body))
	return v
}

func gatewayName() string { return "gw-" + id.Short() + id.Short() }

func createGateway(t *testing.T, c *api.ClientWithResponses, name string, authMethod map[string]any) *api.CreateGatewayResponse {
	t.Helper()
	res, err := c.CreateGatewayWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, map[string]any{"name": name, "authMethod": authMethod}))
	require.NoError(t, err)
	return res
}

// newGateway creates a token-auth gateway as the tenant's admin.
func newGateway(t *testing.T, tn *harness.Tenant) gatewayView {
	t.Helper()
	res := createGateway(t, tn.Admin.API, gatewayName(), tokenAuth())
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return decodeGateway(t, res.Body)
}

func getGateway(t *testing.T, tn *harness.Tenant, gatewayID uuid.UUID) gatewayView {
	t.Helper()
	res, err := tn.Admin.API.GetGatewayWithResponse(t.Context(), gatewayID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return decodeGateway(t, res.Body)
}

func gatewayIDs(t *testing.T, c *api.ClientWithResponses) []uuid.UUID {
	t.Helper()
	res, err := c.ListGatewaysWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []uuid.UUID{}
	for _, g := range *res.JSON200 {
		ids = append(ids, g.Id)
	}
	return ids
}

// enrollmentToken mints a gateway enrollment token as the tenant's admin.
func enrollmentToken(t *testing.T, tn *harness.Tenant, gatewayID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.MintGatewayEnrollmentTokenWithResponse(t.Context(), gatewayID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res.JSON200.Token
}

func loginGateway(t *testing.T, tn *harness.Tenant, token string) *api.LoginGatewayResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginGatewayWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, map[string]any{"method": "token", "token": token}))
	require.NoError(t, err)
	return res
}

// agent is what a running gateway or relay holds after login: its access token and a
// client that sends it.
type agent struct {
	Token string
	API   *api.ClientWithResponses
}

func enrollGateway(t *testing.T, tn *harness.Tenant, gatewayID uuid.UUID) agent {
	t.Helper()
	res := loginGateway(t, tn, enrollmentToken(t, tn, gatewayID))
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return agent{Token: res.JSON200.AccessToken, API: tn.Client(t, res.JSON200.AccessToken)}
}

// gatewayTokenStatus is the status a gateway token gets on a route that accepts it and
// changes nothing, so it shows whether the token is still honoured.
func gatewayTokenStatus(t *testing.T, gw agent) (int, []byte) {
	t.Helper()
	res, err := gw.API.GetRelaysWithResponse(t.Context())
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func connectGateway(t *testing.T, gw agent, body api.ConnectGatewayJSONRequestBody) *api.ConnectGatewayResponse {
	t.Helper()
	res, err := gw.API.ConnectGatewayWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

func relayName() string { return "rl-" + id.Short() + id.Short() }

// relayHost resolves to fakenet, which accepts nothing on the relay ports.
func relayHost() string { return relayName() + ".relay.test" }

type relayView struct {
	ID         uuid.UUID `json:"id"`
	Name       string    `json:"name"`
	Host       string    `json:"host"`
	CanRevoke  bool      `json:"canRevoke"`
	AuthMethod struct {
		Method string `json:"method"`
	} `json:"authMethod"`
}

func createRelay(t *testing.T, c *api.ClientWithResponses, name, host string) *api.CreateRelayResponse {
	t.Helper()
	res, err := c.CreateRelayWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, map[string]any{"name": name, "host": host, "authMethod": tokenAuth()}))
	require.NoError(t, err)
	return res
}

func newRelay(t *testing.T, tn *harness.Tenant) relayView {
	t.Helper()
	res := createRelay(t, tn.Admin.API, relayName(), relayHost())
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var v relayView
	require.NoError(t, json.Unmarshal(res.Body, &v))
	return v
}

func relayToken(t *testing.T, tn *harness.Tenant, relayID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.MintRelayEnrollmentTokenWithResponse(t.Context(), relayID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res.JSON200.Token
}

func loginRelay(t *testing.T, tn *harness.Tenant, token string) *api.LoginRelayResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginRelayWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, map[string]any{"method": "token", "token": token}))
	require.NoError(t, err)
	return res
}

func enrollRelay(t *testing.T, tn *harness.Tenant, relayID uuid.UUID) agent {
	t.Helper()
	res := loginRelay(t, tn, relayToken(t, tn, relayID))
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return agent{Token: res.JSON200.AccessToken, API: tn.Client(t, res.JSON200.AccessToken)}
}

func relayIDs(t *testing.T, c *api.ClientWithResponses) []uuid.UUID {
	t.Helper()
	res, err := c.GetRelaysWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []uuid.UUID{}
	for _, r := range *res.JSON200 {
		ids = append(ids, r.Id)
	}
	return ids
}

func relayHosts(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.GetRelaysWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	hosts := []string{}
	for _, r := range *res.JSON200 {
		hosts = append(hosts, r.Host)
	}
	return hosts
}

func parseCert(t *testing.T, pemText string) *x509.Certificate {
	t.Helper()
	return parseChain(t, pemText)[0]
}

func parseChain(t *testing.T, pemText string) []*x509.Certificate {
	t.Helper()
	var certs []*x509.Certificate
	rest := []byte(pemText)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			break
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		certs = append(certs, cert)
	}
	require.NotEmpty(t, certs, "no certificate in %q", pemText)
	return certs
}

// postgresConnection is an App Connection to the target database, which a test then
// points at a gateway or a pool.
func postgresConnection(t *testing.T, tn *harness.Tenant) uuid.UUID {
	t.Helper()
	return fixture.NewAppConnection(t, tn, fixture.PostgresAppConnection(fixture.OpenPostgresTarget(t, tn))).ID
}

func updateConnection(t *testing.T, c *api.ClientWithResponses, connID uuid.UUID, body api.UpdatePostgresAppConnectionJSONRequestBody) *api.UpdatePostgresAppConnectionResponse {
	t.Helper()
	res, err := c.UpdatePostgresAppConnectionWithResponse(t.Context(), connID, body)
	require.NoError(t, err)
	return res
}

type connectionRoute struct {
	GatewayID     *uuid.UUID `json:"gatewayId"`
	GatewayPoolID *uuid.UUID `json:"gatewayPoolId"`
}

func connectionRouteOf(t *testing.T, tn *harness.Tenant, connID uuid.UUID) connectionRoute {
	t.Helper()
	res, err := tn.Admin.API.GetPostgresAppConnectionWithResponse(t.Context(), connID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var out struct {
		AppConnection connectionRoute `json:"appConnection"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.AppConnection
}

func newPool(t *testing.T, tn *harness.Tenant) uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.CreateGatewayPoolWithResponse(t.Context(),
		api.CreateGatewayPoolJSONRequestBody{Name: "pool-" + id.Short() + id.Short()})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res.JSON200.Id
}

func addToPool(t *testing.T, c *api.ClientWithResponses, poolID, gatewayID uuid.UUID) *api.AddGatewayToPoolResponse {
	t.Helper()
	res, err := c.AddGatewayToPoolWithResponse(t.Context(), poolID, api.AddGatewayToPoolJSONRequestBody{GatewayId: gatewayID})
	require.NoError(t, err)
	return res
}

func poolMembers(t *testing.T, tn *harness.Tenant, poolID uuid.UUID) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.GetGatewayPoolByIdWithResponse(t.Context(), poolID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []uuid.UUID{}
	for _, g := range res.JSON200.Gateways {
		ids = append(ids, g.Id)
	}
	return ids
}
