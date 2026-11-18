package syncs_test

import (
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAwsSecretsManagerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write the certificate, chain, CA certificate and key as one JSON secret under the configured KMS key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		body := api.CreateAwsSecretsManagerPkiSyncJSONRequestBody{
			Name:           "sm-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.Region = api.CreateAwsSecretsManagerPkiSyncJSONBodyDestinationConfigRegionUsEast1
		body.DestinationConfig.KeyId = new("alias/pki-certificates")
		body.SyncOptions.CertificateNameSchema = "infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateAwsSecretsManagerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetAwsSecretsManagerPkiSync, syncID, nil)
		name := "infisical-" + strings.ReplaceAll(cert.ID.String(), "-", "")
		secret := acct.Secrets(t)[name]
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
}
