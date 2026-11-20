package kmip_test

import (
	"context"
	"crypto/x509"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func listServers(t *testing.T, tn *harness.Tenant) []kmipServer {
	t.Helper()
	res, err := tn.Admin.API.ListKmipServersWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[[]kmipServer](t, res.Body)
}

func serverUpdateEvents(t *testing.T, tn *harness.Tenant, serverID uuid.UUID, n int) []string {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) ([]string, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: new("kmip-server-update"),
			StartDate: new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second)),
			Limit:     new(float32(100)),
		})
		if err != nil || res.JSON200 == nil {
			return nil, false, err
		}
		var actors []string
		for _, l := range res.JSON200.AuditLogs {
			if metadata, _ := l.Event.Metadata.(map[string]any); metadata["kmipServerId"] == serverID.String() {
				actors = append(actors, l.Actor.Type)
			}
		}
		return actors, len(actors) >= n, nil
	})
	require.NoError(t, err)
	return got
}

func TestKmipServer(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create, list, read, update and delete a server", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")

		// Action
		updated, err := tn.Admin.API.UpdateKmipServerWithBodyWithResponse(t.Context(), server.ID, "application/json",
			kms.JSON(t, map[string]any{"hostnamesOrIps": "kmip.example.com,10.0.0.5"}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, updated.StatusCode(), updated.Body)
		listed := listServers(t, tn)
		deleted, err := tn.Admin.API.DeleteKmipServerWithResponse(t.Context(), server.ID)
		require.NoError(t, err)

		// Assert
		require.Len(t, listed, 1)
		require.Equal(t, "kmip.example.com, 10.0.0.5", listed[0].HostnamesOrIps)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)
		get, err := tn.Admin.API.GetKmipServerWithResponse(t.Context(), server.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, get.StatusCode(), get.Body)
		require.Empty(t, listServers(t, tn))
	})

	t.Run("should refuse a second server with the same name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")

		// Action
		res, err := tn.Admin.API.CreateKmipServerWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, map[string]any{
			"name": server.Name, "hostnamesOrIps": "other.example.com", "authMethod": map[string]any{"method": "token"},
		}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, `A KMIP server named "`+server.Name+`" already exists`, apierr.Message(res.Body))
		require.Len(t, listServers(t, tn), 1)
	})

	t.Run("should refuse an organization member and change nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		create, err := member.API.CreateKmipServerWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, map[string]any{
			"name": "s-" + id.Short(), "hostnamesOrIps": "kmip.example.com", "authMethod": map[string]any{"method": "token"},
		}))
		require.NoError(t, err)
		update, err := member.API.UpdateKmipServerWithBodyWithResponse(t.Context(), server.ID, "application/json",
			kms.JSON(t, map[string]any{"hostnamesOrIps": "attacker.example.com"}))
		require.NoError(t, err)

		// Assert
		require.Equal(t, []int{http.StatusForbidden, http.StatusForbidden}, []int{create.StatusCode(), update.StatusCode()})
		require.Equal(t, []kmipServer{server}, listServers(t, tn))
	})

	t.Run("should not record a server update when the member making it is refused", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		refused, err := member.API.UpdateKmipServerWithBodyWithResponse(t.Context(), server.ID, "application/json", kms.JSON(t, map[string]any{}))
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, refused.StatusCode(), refused.Body)

		// Action
		res, err := tn.Admin.API.UpdateKmipServerWithBodyWithResponse(t.Context(), server.ID, "application/json",
			kms.JSON(t, map[string]any{"hostnamesOrIps": "kmip2.example.com"}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		spec.Why(t, "the refused update came first, so once the admin's update is logged a recorded refusal would be too")
		require.Equal(t, []string{"user"}, serverUpdateEvents(t, tn, server.ID, 1))
	})

	t.Run("should log a server in once with its enrollment token, and refuse a reused or unknown token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")
		token := mintEnrollmentToken(t, tn, server.ID)

		// Action
		first, accessToken := loginServer(t, tn, token)
		reused, _ := loginServer(t, tn, token)
		unknown, _ := loginServer(t, tn, "gwe_"+id.Short())

		// Assert
		requireStatus(t, http.StatusOK, first.StatusCode(), first.Body)
		require.NotEmpty(t, accessToken)
		for _, res := range []*api.LoginKmipServerResponse{reused, unknown} {
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equal(t, "Invalid enrollment token", apierr.Message(res.Body))
		}
	})

	t.Run("should refuse an earlier unused enrollment token once a new one is minted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com")
		earlier := mintEnrollmentToken(t, tn, server.ID)
		later := mintEnrollmentToken(t, tn, server.ID)

		// Action
		res, _ := loginServer(t, tn, earlier)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		ok, _ := loginServer(t, tn, later)
		requireStatus(t, http.StatusOK, ok.StatusCode(), ok.Body)
	})

	t.Run("should refuse the server's access token once access is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := enrollServer(t, tn)

		// Action
		res, err := tn.Admin.API.RevokeKmipServerAccessWithResponse(t.Context(), server.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		connect, err := tn.Client(t, server.token).ConnectKmipServerWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, connect.StatusCode(), connect.Body)
		require.Equal(t, "KMIP server token has been revoked", apierr.Message(connect.Body))
	})

	t.Run("should refuse the server's access token once the server is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := enrollServer(t, tn)

		// Action
		res, err := tn.Admin.API.DeleteKmipServerWithResponse(t.Context(), server.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		connect, err := tn.Client(t, server.token).ConnectKmipServerWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, connect.StatusCode(), connect.Body)
	})

	t.Run("should issue a server-auth certificate with the configured hostnames that verifies against the root alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "kmip.example.com, localhost, 10.0.0.5")
		_, token := loginServer(t, tn, mintEnrollmentToken(t, tn, server.ID))

		// Action
		res, err := tn.Client(t, token).ConnectKmipServerWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		cert := kms.Decode[serverCertificate](t, res.Body)
		leaf := parseCertificate(t, cert.Certificate)
		require.Equal(t, []string{"kmip.example.com", "localhost"}, leaf.DNSNames)
		require.Len(t, leaf.IPAddresses, 1)
		require.True(t, leaf.IPAddresses[0].Equal(net.ParseIP("10.0.0.5")))
		require.Equal(t, []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, leaf.ExtKeyUsage)
		requireVerifies(t, cert.Certificate, cert.CertificateChain, x509.ExtKeyUsageServerAuth)
		require.NotEmpty(t, cert.ClientCertificateChain)
	})

	t.Run("should refuse saving an email or URL as a hostname and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		for _, hostnames := range []string{"admin@example.com", "https://kmip.example.com"} {
			// Action
			res, err := tn.Admin.API.CreateKmipServerWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, map[string]any{
				"name": "s-" + id.Short(), "hostnamesOrIps": hostnames, "authMethod": map[string]any{"method": "token"},
			}))

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
			require.Contains(t, string(res.Body),
				"Each hostname or IP must be a hostname (such as kmip.example.com or localhost) or an IP address")
		}
		require.Empty(t, listServers(t, tn))
	})

	t.Run("should refuse connect when no hostnames are configured", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		server := createServer(t, tn, "")
		_, token := loginServer(t, tn, mintEnrollmentToken(t, tn, server.ID))

		// Action
		res, err := tn.Client(t, token).ConnectKmipServerWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "KMIP server has no hostnames or IPs configured. Set them before connecting.", apierr.Message(res.Body))
	})

	t.Run("should refuse a user's or an identity's token on connect", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		for _, pr := range []*harness.Principal{tn.Admin, identity} {
			// Action
			res, err := pr.API.ConnectKmipServerWithResponse(t.Context())

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		}
	})
}
