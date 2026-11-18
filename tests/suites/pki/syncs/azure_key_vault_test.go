package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAzureKeyVaultPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should import the certificate, its chain and its key as one certificate object named by the schema with the id's dashes dropped", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AzureKeyVaultClientSecretAppConnection)
		kv := azure.OpenKeyVault(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce()))
		vault := "kv" + id.Short()
		kv.Seed(t, azure.WithVault(vault))
		body := api.CreateAzureKeyVaultPkiSyncJSONRequestBody{
			Name:           "azure-key-vault-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.VaultBaseUrl = "https://" + vault + ".vault.azure.net"
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateAzureKeyVaultPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetAzureKeyVaultPkiSync, syncID, nil)
		certs := kv.State(t).Vaults[vault].Certificates
		require.Len(t, certs, 1)
		imported := certs["Infisical-"+strings.ReplaceAll(cert.ID.String(), "-", "")]
		require.NotNil(t, imported, "the certificate object should be named by the schema, got %v", certs)
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(imported.Certificate))
		require.Contains(t, imported.Imported, strings.TrimSpace(cert.PrivateKey))
		require.Contains(t, imported.Imported, strings.TrimSpace(cloudFirstPEM(t, cert.Chain)))
	})

	t.Run("should leave a disabled certificate object alone when it is past the first page of the vault's list", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The fake lists two certificates a page. The two fillers sort first, so the disabled
			object only shows up on the page nextLink points to.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AzureKeyVaultClientSecretAppConnection)
		kv := azure.OpenKeyVault(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce()))
		vault := "kv" + id.Short()
		name := "Infisical-" + strings.ReplaceAll(cert.ID.String(), "-", "")
		kv.Seed(t, map[string]any{"vaults": map[string]any{vault: map[string]any{"certificates": map[string]any{
			"A-filler-1": map[string]any{"version": "v1", "versions": 1, "enabled": true},
			"A-filler-2": map[string]any{"version": "v1", "versions": 1, "enabled": true},
			name:         map[string]any{"version": "v1", "versions": 1, "enabled": false},
		}}}})
		body := api.CreateAzureKeyVaultPkiSyncJSONRequestBody{
			Name:           "azure-key-vault-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.VaultBaseUrl = "https://" + vault + ".vault.azure.net"
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateAzureKeyVaultPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		cloudSyncSucceeded(t, tn.Admin.API.GetAzureKeyVaultPkiSync, res.JSON200.Id.String(), nil)
		certs := kv.State(t).Vaults[vault].Certificates
		require.Len(t, certs, 3)
		require.NotNil(t, certs[name])
		require.False(t, certs[name].Enabled)
		require.Equal(t, 1, certs[name].Versions, "the disabled object was imported over")
		require.Empty(t, certs[name].Imported)
	})
}
