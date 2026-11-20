package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/linuxserver"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// linuxSync is an auto-syncing Linux Server sync writing one certificate as
// <directory>/<commonName>.pem and .key.
type linuxSync struct {
	id   string
	name string
	host *linuxserver.ControlPlane
	// base is the path of the certificate's files without their extension.
	base string
}

// linuxSyncBody is a sync of one certificate into /etc/ssl/app, named by its common name.
func linuxSyncBody(t *testing.T, conn *fixture.AppConnection, g *pki.Graph, cert pki.Certificate) api.CreateLinuxServerPkiSyncJSONRequestBody {
	t.Helper()
	body := api.CreateLinuxServerPkiSyncJSONRequestBody{
		Name:           "linux-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.DestinationPath = "/etc/ssl/app"
	body.SyncOptions.CertificateNameSchema = "{{commonName}}"
	return body
}

// newLinuxSync creates the sync over a new SSH connection to a host holding
// /etc/ssl/app; configure adjusts the body before Infisical is handed it.
func newLinuxSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate, configure func(*api.CreateLinuxServerPkiSyncJSONRequestBody)) linuxSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.SSHPasswordAppConnection)
	host := linuxserver.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	host.Seed(t, linuxserver.WithDirectories("/etc/ssl/app"))
	body := linuxSyncBody(t, conn, g, cert)
	if configure != nil {
		configure(&body)
	}
	res, err := tn.Admin.API.CreateLinuxServerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	base := body.DestinationConfig.DestinationPath + "/" + pki.ParseLeaf(t, cert.Certificate).Subject.CommonName
	return linuxSync{id: res.JSON200.Id.String(), name: body.Name, host: host, base: base}
}

func (s linuxSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncLinuxServerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestLinuxServerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write the certificate and key with the configured modes and owner and leave no temp file behind", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newLinuxSync(t, tn, g, cert, func(b *api.CreateLinuxServerPkiSyncJSONRequestBody) {
			b.SyncOptions.FileMode = new("640")
			b.SyncOptions.PrivateKeyFileMode = new("600")
			b.SyncOptions.Owner = new("www-data")
			b.SyncOptions.Group = new("ssl-cert")
		})

		// Assert
		cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, nil)
		files := s.host.State(t).Files
		certFile, keyFile := files[s.base+".pem"], files[s.base+".key"]
		require.NotNil(t, certFile, "no certificate file among %v", fileNames(files))
		require.NotNil(t, keyFile, "no key file among %v", fileNames(files))
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(certFile.Content))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(keyFile.Content))
		require.Equal(t, []any{uint32(0o640), "www-data", "ssl-cert"}, []any{certFile.Mode, certFile.Owner, certFile.Group})
		require.Equal(t, []any{uint32(0o600), "www-data", "ssl-cert"}, []any{keyFile.Mode, keyFile.Owner, keyFile.Group})
		s.host.ExpectEvent[linuxserver.FileRenamed](t, func(e linuxserver.FileRenamed) bool { return e.To == s.base+".key" })
		for name := range files {
			require.NotContains(t, name, ".infisical.tmp")
		}
	})

	t.Run("should overwrite the same files with a renewed certificate and its key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newLinuxSync(t, tn, g, cert, nil)
		done := cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, nil)
		mark := s.host.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, done.LastSyncedAt)
		s.host.ExpectEvent[linuxserver.FileRenamed](t, func(e linuxserver.FileRenamed) bool { return e.To == s.base+".pem" }, fakenet.Since(mark))
		files := s.host.State(t).Files
		require.Len(t, files, 3, "the renewed certificate should replace the certificate, key and chain files, not add more: %v", fileNames(files))
		leaf := pki.ParseLeaf(t, renewed.JSON200.Certificate)
		require.Equal(t, leaf.Raw, pki.ParseLeaf(t, files[s.base+".pem"].Content).Raw)
		require.Equal(t, leaf.PublicKey, acmPublicKey(t, files[s.base+".key"].Content))
	})

	t.Run("should mark the certificate failed and write nothing when the destination directory does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newLinuxSync(t, tn, g, cert, func(b *api.CreateLinuxServerPkiSyncJSONRequestBody) {
			b.DestinationConfig.DestinationPath = "/etc/ssl/missing"
		})

		// Assert
		cloudSyncAwait(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, nil, "failed")
		require.Equal(t, `Failed to sync certificate: Destination directory "/etc/ssl/missing" does not exist or is not writable`, failureMessage(t, tn, s.id))
		require.Empty(t, s.host.State(t).Files)
	})

	t.Run("should refuse a post-sync command and write nothing when the connection has no gateway", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Post-sync commands and health checks run only through a gateway, and this suite has
			none, so running a command after a sync cannot be covered here.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.SSHPasswordAppConnection)
		host := linuxserver.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		host.Seed(t, linuxserver.WithDirectories("/etc/ssl/app"))
		body := linuxSyncBody(t, conn, g, cert)
		body.SyncOptions.PostSyncCommand = new("systemctl reload nginx")

		// Action
		res, err := tn.Admin.API.CreateLinuxServerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating the sync: %s", apierr.Body(res.Body))
		require.Equal(t, "A post-sync command runs through a gateway. Configure the sync's App Connection to use a gateway, or clear the command.", apierr.Message(res.Body))
		host.ExpectNoEvent[linuxserver.FileWritten](t, nil)
	})
}

func TestLinuxServerPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should unlink the sync's certificate and key and leave other files in the directory", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newLinuxSync(t, tn, g, cert, nil)
		s.host.Seed(t, map[string]any{"files": map[string]any{"/etc/ssl/app/unmanaged.pem": map[string]any{"content": "keep", "mode": 0o644}}})
		cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, nil)
		mark := s.host.Mark(t)

		// Action
		res, err := tn.Admin.API.RemoveLinuxServerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		for _, ext := range []string{".pem", ".key"} {
			s.host.ExpectEvent[linuxserver.FileRemoved](t, func(e linuxserver.FileRemoved) bool { return e.Path == s.base+ext }, fakenet.Since(mark), cloudSyncRemoval)
		}
		files := s.host.State(t).Files
		require.Equal(t, []string{"/etc/ssl/app/unmanaged.pem"}, fileNames(files))
	})
}

func TestLinuxServerPkiSync_HealthCheck(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse to test a health check when the connection has no gateway", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A health check runs only through a gateway, and this suite has none, so a passing
			check against a reachable host cannot be covered here.`)

		// Setup
		tn := h.NewTenant(t)
		g, _ := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.SSHPasswordAppConnection)
		var body api.TestLinuxServerPkiSyncHealthCheckJSONRequestBody
		fromJSON(t, &body, map[string]any{
			"connectionId":      conn.ID,
			"applicationId":     g.App.ID,
			"destinationConfig": map[string]any{"destinationPath": "/etc/ssl/app"},
			"syncOptions":       map[string]any{"healthCheckCommand": "test -d {{certificateDirectory}}"},
		})

		// Action
		res, err := tn.Admin.API.TestLinuxServerPkiSyncHealthCheckWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "testing the health check: %s", apierr.Body(res.Body))
		require.Equal(t, "A health check runs through a gateway. Configure the sync's App Connection to use a gateway, or clear the command.", apierr.Message(res.Body))
	})

	t.Run("should refuse to run the health check of a sync that has none configured", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A sync can hold a health check only when its connection uses a gateway, which this
			suite cannot provide, so the recorded result of a run cannot be covered here.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newLinuxSync(t, tn, g, cert, nil)
		cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, s.id, nil)
		mark := s.host.Mark(t)

		// Action
		res, err := tn.Admin.API.RunLinuxServerPkiSyncHealthCheckWithResponse(t.Context(), uuid.MustParse(s.id))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "running the health check: %s", apierr.Body(res.Body))
		require.Equal(t, "PKI sync '"+s.name+"' has no health check configured. Add one under the sync's Commands step first.", apierr.Message(res.Body))
		s.host.ExpectNoEvent[linuxserver.FileWritten](t, nil, fakenet.Since(mark))
	})
}

func fileNames(files map[string]*linuxserver.File) []string {
	out := make([]string, 0, len(files))
	for name := range files {
		out = append(out, name)
	}
	return out
}
