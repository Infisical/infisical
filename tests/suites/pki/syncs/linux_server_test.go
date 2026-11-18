package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/linuxserver"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLinuxServerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write the certificate and key with the configured modes and owner and leave no temp file behind", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.SSHPasswordAppConnection)
		host := linuxserver.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		host.Seed(t, linuxserver.WithDirectories("/etc/ssl/app"))
		base := "/etc/ssl/app/" + pki.ParseLeaf(t, cert.Certificate).Subject.CommonName
		body := api.CreateLinuxServerPkiSyncJSONRequestBody{
			Name:           "linux-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.DestinationPath = "/etc/ssl/app"
		body.SyncOptions.CertificateNameSchema = "{{commonName}}"
		body.SyncOptions.FileMode = new("640")
		body.SyncOptions.PrivateKeyFileMode = new("600")
		body.SyncOptions.Owner = new("www-data")
		body.SyncOptions.Group = new("ssl-cert")

		// Action
		res, err := tn.Admin.API.CreateLinuxServerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetLinuxServerPkiSync, syncID, nil)
		files := host.State(t).Files
		certFile, keyFile := files[base+".pem"], files[base+".key"]
		require.NotNil(t, certFile, "no certificate file among %v", fileNames(files))
		require.NotNil(t, keyFile, "no key file among %v", fileNames(files))
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(certFile.Content))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(keyFile.Content))
		require.Equal(t, []any{uint32(0o640), "www-data", "ssl-cert"}, []any{certFile.Mode, certFile.Owner, certFile.Group})
		require.Equal(t, []any{uint32(0o600), "www-data", "ssl-cert"}, []any{keyFile.Mode, keyFile.Owner, keyFile.Group})
		host.ExpectEvent[linuxserver.FileRenamed](t, func(e linuxserver.FileRenamed) bool { return e.To == base+".key" })
		for name := range files {
			require.NotContains(t, name, ".infisical.tmp")
		}
	})
}

func fileNames(files map[string]*linuxserver.File) []string {
	out := make([]string, 0, len(files))
	for name := range files {
		out = append(out, name)
	}
	return out
}
