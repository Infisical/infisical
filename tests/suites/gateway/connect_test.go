package gateway_test

import (
	"crypto/x509"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ssh"
)

func TestGatewayConnect_Certificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a one-day server certificate naming the gateway, from the organization's gateway CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		cert := parseCert(t, res.JSON200.Pki.ServerCertificate)
		require.WithinDuration(t, time.Now().Add(24*time.Hour), cert.NotAfter, 10*time.Minute)
		require.Len(t, cert.URIs, 1)
		require.Equal(t, "urn:infisical:gateway:"+gw.ID.String(), cert.URIs[0].String())
		require.Equal(t, "Infisical Gateway Server CA", cert.Issuer.CommonName)
		require.Equal(t, []string{tn.OrgID.String()}, cert.Issuer.Organization)
		connectedRoot(t, tn, res)
	})

	t.Run("should issue an ssh user certificate naming the gateway for its relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON200.Ssh)
		require.Equal(t, relay.Host, *res.JSON200.RelayHost)
		key, _, _, _, err := ssh.ParseAuthorizedKey([]byte(res.JSON200.Ssh.ClientCertificate))
		require.NoError(t, err)
		cert, ok := key.(*ssh.Certificate)
		require.True(t, ok, "not an ssh certificate: %s", res.JSON200.Ssh.ClientCertificate)
		require.Equal(t, uint32(ssh.UserCert), cert.CertType)
		require.Contains(t, cert.ValidPrincipals, gw.ID.String())
	})

	t.Run("should issue certificates under a different CA for another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		first, second := h.NewTenant(t), h.NewTenant(t)
		firstRoot := connectedRoot(t, first, connectNewGateway(t, first))
		secondGateway := newGateway(t, second)
		secondRelay := newRelay(t, second)
		running := enrollGateway(t, second, secondGateway.ID)

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &secondRelay.Name})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotEqual(t, firstRoot.Raw, connectedRoot(t, second, res).Raw)
		require.Equal(t, []string{second.OrgID.String()}, parseCert(t, res.JSON200.Pki.ServerCertificate).Issuer.Organization)
	})
}

func TestGatewayConnect_Transport(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a direct address on Infisical Cloud and leave the gateway unrouted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)
		address := "gateway.example.test:8443"

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{DirectAddress: &address})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Direct gateway connections are not available on Infisical Cloud", apierr.Message(res.Body))
		require.Nil(t, getGateway(t, tn, gw.ID).RelayID)
	})

	t.Run("should answer 404 for a relay that does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)
		missing := relayName()

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &missing})

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Nil(t, getGateway(t, tn, gw.ID).RelayID)
	})

	t.Run("should answer 404 for another organization's relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		theirs := newRelay(t, h.NewTenant(t))
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &theirs.Name})

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Nil(t, getGateway(t, tn, gw.ID).RelayID)
	})

	t.Run("should answer 404 when a gateway with no relay names no transport", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{})

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "No connection transport associated with this gateway", apierr.Message(res.Body))
	})

	t.Run("should list the gateway under its relay once connected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		connected := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})

		// Assert
		requireStatus(t, http.StatusOK, connected.StatusCode(), connected.Body)
		res, err := tn.Admin.API.ListRelayGatewaysWithResponse(t.Context(), relay.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, *res.JSON200, 1)
		require.Equal(t, gw.ID.String(), (*res.JSON200)[0].Id)
		require.Equal(t, relay.ID, *getGateway(t, tn, gw.ID).RelayID)
	})
}

func TestGatewayConnect_Heartbeat(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report the gateway unreachable and zero its heartbeat ttl when nothing answers the probe", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)
		connected := connectGateway(t, running, api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})
		requireStatus(t, http.StatusOK, connected.StatusCode(), connected.Body)

		// Action
		res, err := running.API.GatewayHeartbeatWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		stored := getGateway(t, tn, gw.ID)
		require.NotNil(t, stored.HeartbeatTTL)
		require.Zero(t, *stored.HeartbeatTTL)
		require.Nil(t, stored.Heartbeat)
	})
}

// connectNewGateway enrolls a new gateway and connects it through a new relay.
func connectNewGateway(t *testing.T, tn *harness.Tenant) *api.ConnectGatewayResponse {
	t.Helper()
	relay := newRelay(t, tn)
	res := connectGateway(t, enrollGateway(t, tn, newGateway(t, tn).ID), api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return res
}

// connectedRoot is the organization's gateway root CA, the last certificate of the chain
// connect hands the gateway, checked to belong to that organization.
func connectedRoot(t *testing.T, tn *harness.Tenant, res *api.ConnectGatewayResponse) *x509.Certificate {
	t.Helper()
	chain := parseChain(t, res.JSON200.Pki.ClientCertificateChain)
	root := chain[len(chain)-1]
	require.Equal(t, "Infisical Gateway Root CA", root.Subject.CommonName)
	require.Equal(t, []string{tn.OrgID.String()}, root.Subject.Organization)
	return root
}

// concurrentFirstUses is how many agents make an organization's first connect at once: enough
// that, without the re-check under the advisory lock, more than one would create the CA.
const concurrentFirstUses = 6

func TestGatewayConnect_ConcurrentFirstConnect(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create one gateway CA when an organization's first gateways connect at once", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		agents := make([]agent, concurrentFirstUses)
		for i := range agents {
			agents[i] = enrollGateway(t, tn, newGateway(t, tn).ID)
		}

		// Action
		results := make([]*api.ConnectGatewayResponse, len(agents))
		errs := make([]error, len(agents))
		var wg sync.WaitGroup
		for i, a := range agents {
			wg.Go(func() {
				results[i], errs[i] = a.API.ConnectGatewayWithResponse(t.Context(), api.ConnectGatewayJSONRequestBody{RelayName: &relay.Name})
			})
		}
		wg.Wait()

		// Assert
		roots := map[string]bool{}
		for i, res := range results {
			require.NoError(t, errs[i])
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			roots[string(connectedRoot(t, tn, res).SubjectKeyId)] = true
		}
		require.Len(t, roots, 1, "the concurrent connects were issued certificates under different root CAs")
	})
}
