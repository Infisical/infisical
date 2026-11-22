package gateway_test

import (
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/ssh"
)

func TestRelay_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create an organization relay that enrolls with a token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		name, host := relayName(), relayHost()

		// Action
		res := createRelay(t, tn.Admin.API, name, host)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got, err := tn.Admin.API.GetRelayWithResponse(t.Context(), res.JSON200.Id)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Equal(t, name, got.JSON200.Name)
		require.Equal(t, host, got.JSON200.Host)
		require.Contains(t, string(got.Body), `"method":"token"`)
	})

	t.Run("should refuse a second relay with the same name and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := newRelay(t, tn)

		// Action
		res := createRelay(t, tn.Admin.API, first.Name, relayHost())

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "already exists")
		require.Equal(t, []string{first.Host}, relayHosts(t, tn))
	})

	t.Run("should refuse a host that points at Infisical's own database", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		database := tn.Module(t, postgres.Key, "harness.Shared").Endpoint(infra.Internal).Host

		// Action
		res := createRelay(t, tn.Admin.API, relayName(), database)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "in-use by Infisical")
		require.Empty(t, relayHosts(t, tn))
	})
}

func TestRelay_Connect(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a one-day tls certificate for the relay's host marked OU=Relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		running := enrollRelay(t, tn, relay.ID)

		// Action
		res, err := running.API.ConnectRelayWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		cert := parseCert(t, res.JSON200.Pki.ServerCertificate)
		require.Equal(t, relay.Host, cert.Subject.CommonName)
		require.Equal(t, []string{"Relay"}, cert.Subject.OrganizationalUnit)
		require.Equal(t, []string{relay.Host}, cert.DNSNames)
		require.WithinDuration(t, time.Now().Add(24*time.Hour), cert.NotAfter, 10*time.Minute)
	})

	t.Run("should issue an ssh host certificate for the relay's host on port 2222", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		running := enrollRelay(t, tn, relay.ID)

		// Action
		res, err := running.API.ConnectRelayWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		key, _, _, _, err := ssh.ParseAuthorizedKey([]byte(res.JSON200.Ssh.ServerCertificate))
		require.NoError(t, err)
		cert, ok := key.(*ssh.Certificate)
		require.True(t, ok, "not an ssh certificate: %s", res.JSON200.Ssh.ServerCertificate)
		require.Equal(t, uint32(ssh.HostCert), cert.CertType)
		require.Equal(t, []string{relay.Host + ":2222"}, cert.ValidPrincipals)
	})
}

func TestRelay_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the relay's access token once the relay is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		running := enrollRelay(t, tn, relay.ID)

		// Action
		res, err := tn.Admin.API.RevokeRelayAccessWithResponse(t.Context(), relay.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		connect, err := running.API.ConnectRelayWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, connect.StatusCode(), connect.Body)
		require.Equal(t, "Relay token has been revoked", apierr.Message(connect.Body))
	})

	t.Run("should report the relay unreachable on heartbeat when nothing listens on its host", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		running := enrollRelay(t, tn, relay.ID)

		// Action
		res, err := running.API.RelayHeartbeatWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Relay "+relay.Name+" is not reachable")
		got, err := tn.Admin.API.GetRelayWithResponse(t.Context(), relay.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, got.StatusCode(), got.Body)
		require.Nil(t, got.JSON200.Heartbeat)
	})
}

func TestRelay_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the organization's relays and not another organization's", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mine := newRelay(t, tn)
		theirs := newRelay(t, h.NewTenant(t))

		// Action
		listed := relayIDs(t, tn.Admin.API)

		// Assert
		require.Contains(t, listed, mine.ID)
		require.NotContains(t, listed, theirs.ID)
	})

	t.Run("should answer 404 and keep the relay when another organization deletes it", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner := h.NewTenant(t)
		relay := newRelay(t, owner)
		outsider := h.NewTenant(t)

		// Action
		res, err := outsider.Admin.API.DeleteRelayWithResponse(t.Context(), relay.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, relayIDs(t, owner.Admin.API), relay.ID)
	})
}

func TestRelay_InstanceRegistration(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	secrets := []struct {
		name   string
		client func(t *testing.T, tn *harness.Tenant) *api.ClientWithResponses
	}{
		{"no auth secret", func(t *testing.T, tn *harness.Tenant) *api.ClientWithResponses { return tn.Anonymous(t) }},
		{"a wrong auth secret", func(t *testing.T, tn *harness.Tenant) *api.ClientWithResponses {
			return tn.Client(t, "not-the-relay-auth-secret")
		}},
	}
	for _, s := range secrets {
		t.Run("should refuse registering an instance relay with "+s.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			name := relayName()

			// Action
			res, err := s.client(t, tn).RegisterInstanceRelayWithResponse(t.Context(),
				api.RegisterInstanceRelayJSONRequestBody{Name: name, Host: relayHost()})

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
			require.Equal(t, "Invalid relay auth secret", apierr.Message(res.Body))
			listed, err := tn.Admin.API.GetRelaysWithResponse(t.Context())
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
			for _, r := range *listed.JSON200 {
				require.NotEqual(t, name, r.Name)
			}
		})
	}
}

func TestRelay_MemberPermission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an organization member deleting a relay", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.DeleteRelayWithResponse(t.Context(), relay.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, relayIDs(t, tn.Admin.API), relay.ID)
	})

	t.Run("should refuse an organization member revoking a relay and keep it connected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		relay := newRelay(t, tn)
		running := enrollRelay(t, tn, relay.ID)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.RevokeRelayAccessWithResponse(t.Context(), relay.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		connect, err := running.API.ConnectRelayWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, connect.StatusCode(), connect.Body)
	})
}

func TestRelay_ConcurrentFirstConnect(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create one relay CA when an organization's first relays connect at once", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		agents := make([]agent, concurrentFirstUses)
		for i := range agents {
			agents[i] = enrollRelay(t, tn, newRelay(t, tn).ID)
		}

		// Action
		results := make([]*api.ConnectRelayResponse, len(agents))
		errs := make([]error, len(agents))
		var wg sync.WaitGroup
		for i, a := range agents {
			wg.Go(func() { results[i], errs[i] = a.API.ConnectRelayWithResponse(t.Context()) })
		}
		wg.Wait()

		// Assert
		issuers := map[string]bool{}
		for i, res := range results {
			require.NoError(t, errs[i])
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			issuers[string(parseCert(t, res.JSON200.Pki.ServerCertificate).AuthorityKeyId)] = true
		}
		require.Len(t, issuers, 1, "the concurrent connects were issued certificates under different relay CAs")
	})
}
