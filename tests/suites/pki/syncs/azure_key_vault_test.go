package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
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

// keyVaultSync is an auto-syncing Azure Key Vault sync into its own vault, naming each
// certificate object Infisical-<certificate id without dashes>.
type keyVaultSync struct {
	id    string
	get   cloudSyncGet
	kv    *azure.VaultControlPlane
	vault string
}

// newKeyVaultSync creates the sync over a new connection and an empty vault; versioning
// sets enableVersioning when not nil, and prepare runs on the vault before Infisical is
// handed the sync.
func newKeyVaultSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, versioning *bool, prepare func(kv *azure.VaultControlPlane, vault string), cert pki.Certificate) keyVaultSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.AzureKeyVaultClientSecretAppConnection)
	kv := azure.OpenKeyVault(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce()))
	vault := "kv" + id.Short()
	kv.Seed(t, azure.WithVault(vault))
	if prepare != nil {
		prepare(kv, vault)
	}
	body := api.CreateAzureKeyVaultPkiSyncJSONRequestBody{
		Name:           "azure-key-vault-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.VaultBaseUrl = "https://" + vault + ".vault.azure.net"
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	body.SyncOptions.EnableVersioning = versioning
	res, err := tn.Admin.API.CreateAzureKeyVaultPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return keyVaultSync{id: res.JSON200.Id.String(), get: tn.Admin.API.GetAzureKeyVaultPkiSync, kv: kv, vault: vault}
}

func (s keyVaultSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncAzureKeyVaultPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func (s keyVaultSync) certificates(t *testing.T) map[string]*azure.VaultCertificate {
	t.Helper()
	return s.kv.State(t).Vaults[s.vault].Certificates
}

// keyVaultName is the object name the sync's schema gives a certificate.
func keyVaultName(certID string) string {
	return "Infisical-" + strings.ReplaceAll(certID, "-", "")
}

func TestAzureKeyVaultPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should import the certificate, its chain and its key as one certificate object named by the schema with the id's dashes dropped", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newKeyVaultSync(t, tn, g, nil, nil, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		certs := s.certificates(t)
		require.Len(t, certs, 1)
		name := keyVaultName(cert.ID.String())
		imported := certs[name]
		require.NotNil(t, imported, "the certificate object should be named by the schema, got %v", certs)
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(imported.Certificate))
		require.Contains(t, imported.Imported, strings.TrimSpace(cert.PrivateKey))
		require.Contains(t, imported.Imported, syncedIntermediate(t, cert))
		s.kv.ExpectEvent[azure.VaultCertificateImported](t, func(e azure.VaultCertificateImported) bool {
			return e.Vault == s.vault && e.Name == name
		})
	})

	t.Run("should leave a disabled certificate object alone when it is past the first page of the vault's list", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The fake lists two certificates a page. The two fillers sort first, so the disabled
			object only shows up on the page nextLink points to.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		name := keyVaultName(cert.ID.String())
		disabled := func(kv *azure.VaultControlPlane, vault string) {
			kv.Seed(t, map[string]any{"vaults": map[string]any{vault: map[string]any{"certificates": map[string]any{
				"A-filler-1": map[string]any{"version": "v1", "versions": 1, "enabled": true},
				"A-filler-2": map[string]any{"version": "v1", "versions": 1, "enabled": true},
				name:         map[string]any{"version": "v1", "versions": 1, "enabled": false},
			}}}})
		}

		// Action
		s := newKeyVaultSync(t, tn, g, nil, disabled, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		certs := s.certificates(t)
		require.Len(t, certs, 3)
		require.NotNil(t, certs[name])
		require.False(t, certs[name].Enabled)
		require.Equal(t, 1, certs[name].Versions, "the disabled object was imported over")
		require.Empty(t, certs[name].Imported)
	})

	t.Run("should import a renewed certificate as a new version of the same object", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newKeyVaultSync(t, tn, g, nil, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		name := keyVaultName(cert.ID.String())
		mark := s.kv.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.kv.ExpectEvent[azure.VaultCertificateImported](t, func(e azure.VaultCertificateImported) bool {
			return e.Vault == s.vault && e.Name == name
		}, fakenet.Since(mark))
		certs := s.certificates(t)
		require.Len(t, certs, 1)
		require.NotNilf(t, certs[name], "the vault should still hold %s, got %v", name, certs)
		require.GreaterOrEqual(t, certs[name].Versions, 2)
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, pki.ParseLeaf(t, certs[name].Certificate).Raw)
	})

	t.Run("should import a renewed certificate under its own name and delete the old object when versioning is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newKeyVaultSync(t, tn, g, new(false), nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		old := keyVaultName(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.kv.ExpectEvent[azure.VaultCertificateDeleted](t, func(e azure.VaultCertificateDeleted) bool {
			return e.Vault == s.vault && e.Name == old
		})
		next := keyVaultName(renewed.JSON200.CertificateId)
		certs := s.certificates(t)
		require.Len(t, certs, 1)
		require.NotNilf(t, certs[next], "the vault should hold %s, got %v", next, certs)
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, pki.ParseLeaf(t, certs[next].Certificate).Raw)
	})

	t.Run("should mark the sync and the certificate failed, with the vault's reason, when Key Vault refuses the import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		name := keyVaultName(cert.ID.String())
		refuse := func(kv *azure.VaultControlPlane, _ string) {
			kv.Fail(t, http.MethodPost, "/certificates/"+name+"/import", http.StatusForbidden,
				fakenet.Body(`{"error":{"code":"Forbidden","message":"Caller is not authorized to perform action on resource.","innererror":{"code":"ForbiddenByRbac"}}}`))
		}

		// Action
		s := newKeyVaultSync(t, tn, g, nil, refuse, cert)

		// Assert
		cloudSyncAwait(t, s.get, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Failed to upload certificate "+name+
			" to Azure Key Vault: Caller is not authorized to perform action on resource.", failureMessage(t, tn, s.id))
		require.Empty(t, s.certificates(t))
	})
}

func TestAzureKeyVaultPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the sync's certificate object, leaving its name soft-deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newKeyVaultSync(t, tn, g, nil, nil, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		name := keyVaultName(cert.ID.String())

		// Action
		res, err := tn.Admin.API.RemoveAzureKeyVaultPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.kv.ExpectEvent[azure.VaultCertificateDeleted](t, func(e azure.VaultCertificateDeleted) bool {
			return e.Vault == s.vault && e.Name == name
		}, cloudSyncRemoval)
		vault := s.kv.State(t).Vaults[s.vault]
		require.Empty(t, vault.Certificates)
		require.Equal(t, []string{name}, vault.Deleted)
	})
}
