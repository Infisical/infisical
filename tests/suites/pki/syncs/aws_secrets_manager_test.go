package syncs_test

import (
	"encoding/json"
	"maps"
	"net/http"
	"slices"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// secretsManagerSync is an auto-syncing Secrets Manager sync that names each secret
// infisical-<certificate id without dashes>.
type secretsManagerSync struct {
	id   string
	get  cloudSyncGet
	acct *aws.ControlPlane
	conn *fixture.AppConnection
}

// newSecretsManagerSync creates the sync over a new AWS connection; preserve sets
// preserveSecretOnRenewal when not nil, and prepare runs on the account before
// Infisical is handed the sync.
func newSecretsManagerSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, preserve *bool, prepare func(*aws.ControlPlane), cert pki.Certificate) secretsManagerSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(acct)
	}
	body := api.CreateAwsSecretsManagerPkiSyncJSONRequestBody{
		Name:           "sm-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.Region = api.CreateAwsSecretsManagerPkiSyncJSONBodyDestinationConfigRegionUsEast1
	body.DestinationConfig.KeyId = new("alias/pki-certificates")
	body.SyncOptions.CertificateNameSchema = "infisical-{{certificateId}}"
	body.SyncOptions.PreserveSecretOnRenewal = preserve
	res, err := tn.Admin.API.CreateAwsSecretsManagerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return secretsManagerSync{id: res.JSON200.Id.String(), get: tn.Admin.API.GetAwsSecretsManagerPkiSync, acct: acct, conn: conn}
}

func (s secretsManagerSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncAwsSecretsManagerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

// smSecretName is the name the sync's schema gives a certificate's secret.
func smSecretName(certID string) string {
	return "infisical-" + strings.ReplaceAll(certID, "-", "")
}

// smSecretLeaf is the certificate a synced secret's JSON value holds.
func smSecretLeaf(t *testing.T, secret *aws.Secret) []byte {
	t.Helper()
	var value map[string]string
	require.NoError(t, json.Unmarshal([]byte(secret.SecretString), &value))
	return pki.ParseLeaf(t, value["certificate"]).Raw
}

func TestAwsSecretsManagerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write the certificate, chain, CA certificate and key as one JSON secret under the configured KMS key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newSecretsManagerSync(t, tn, g, nil, nil, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		name := smSecretName(cert.ID.String())
		secret := s.acct.Secrets(t)[name]
		require.NotNilf(t, secret, "Secrets Manager should hold %s", name)
		require.Equal(t, "alias/pki-certificates", secret.KmsKeyID)
		var value map[string]string
		require.NoError(t, json.Unmarshal([]byte(secret.SecretString), &value))
		require.ElementsMatch(t, []string{"certificate", "private_key", "certificate_chain", "ca_certificate"}, slices.Collect(maps.Keys(value)))
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).Raw, pki.ParseLeaf(t, value["certificate"]).Raw)
		require.Equal(t, pki.ParseLeaf(t, cert.Chain).Raw, pki.ParseLeaf(t, value["certificate_chain"]).Raw)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).PublicKey, acmPublicKey(t, value["private_key"]))
		require.True(t, pki.ParseLeaf(t, value["ca_certificate"]).IsCA)
	})

	t.Run("should update the same secret with a renewed certificate instead of creating another", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newSecretsManagerSync(t, tn, g, nil, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		name := smSecretName(cert.ID.String())
		mark := s.acct.SecretsManager.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.acct.SecretsManager.ExpectEvent[aws.SecretUpdated](t, func(e aws.SecretUpdated) bool { return e.Name == name }, fakenet.Since(mark))
		secrets := s.acct.Secrets(t)
		require.Len(t, secrets, 1)
		require.NotNilf(t, secrets[name], "Secrets Manager should still hold %s, got %v", name, slices.Collect(maps.Keys(secrets)))
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, smSecretLeaf(t, secrets[name]))
		s.acct.SecretsManager.ExpectNoEvent[aws.SecretCreated](t, nil, fakenet.Since(mark))
	})

	t.Run("should write a renewed certificate to a new secret and delete the old one when preserving the secret is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newSecretsManagerSync(t, tn, g, new(false), nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		old := smSecretName(cert.ID.String())

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		next := smSecretName(renewed.JSON200.CertificateId)
		s.acct.SecretsManager.ExpectEvent[aws.SecretCreated](t, func(e aws.SecretCreated) bool { return e.Name == next })
		s.acct.SecretsManager.ExpectEvent[aws.SecretDeleted](t, func(e aws.SecretDeleted) bool { return e.Name == old })
		secrets := s.acct.Secrets(t)
		require.Equal(t, []string{next}, slices.Collect(maps.Keys(secrets)))
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, smSecretLeaf(t, secrets[next]))
	})

	t.Run("should mark the sync and the certificate failed, with the destination's reason, when Secrets Manager refuses the secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newSecretsManagerSync(t, tn, g, nil, func(a *aws.ControlPlane) { a.Seed(t, aws.Deny(aws.SecretsManager, "CreateSecret")) }, cert)

		// Assert
		cloudSyncAwait(t, s.get, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: User: arn:aws:iam::"+aws.AccountID(s.conn.Nonce())+":user/infisical is not authorized to perform: "+
			"secretsmanager:CreateSecret because no identity-based policy allows the secretsmanager:CreateSecret action", failureMessage(t, tn, s.id))
		require.Empty(t, s.acct.Secrets(t))
	})
}

func TestAwsSecretsManagerPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the sync's secret without a recovery window and leave secrets Infisical did not write", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newSecretsManagerSync(t, tn, g, nil, func(a *aws.ControlPlane) { a.Seed(t, aws.SeedSecret("unmanaged", "keep")) }, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		name := smSecretName(cert.ID.String())

		// Action
		res, err := tn.Admin.API.RemoveAwsSecretsManagerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.acct.SecretsManager.ExpectEvent[aws.SecretDeleted](t, func(e aws.SecretDeleted) bool { return e.Name == name }, cloudSyncRemoval)
		require.Equal(t, []string{"unmanaged"}, slices.Collect(maps.Keys(s.acct.Secrets(t))))
	})
}
