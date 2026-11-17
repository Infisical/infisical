package crypto_test

import (
	"crypto"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type exportedKey struct {
	KeyID      uuid.UUID `json:"keyId"`
	Name       string
	KeyUsage   string `json:"keyUsage"`
	Algorithm  string
	PrivateKey string `json:"privateKey"`
	PublicKey  string `json:"publicKey"`
}

func TestKmsKey_ExportPrivateKey(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should export an asymmetric private key whose public key matches the public key endpoint", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ECC_NIST_P384"))

		// Action
		material := kms.ExportPrivateKey(t, proj, key.ID)

		// Assert
		block, _ := pem.Decode(material)
		require.NotNil(t, block, "the exported key is a PEM")
		private, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		require.NoError(t, err)
		public, err := x509.MarshalPKIXPublicKey(private.(crypto.Signer).Public())
		require.NoError(t, err)
		require.Equal(t, publicKey(t, proj, key.ID), public)
	})

	t.Run("should refuse a non-exportable key and return no material", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.NotExportable())

		// Action
		res, err := tn.Admin.API.GetKmsKeyPrivateKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to export this key", apierr.Message(res.Body))
		require.NotContains(t, string(res.Body), "privateKey")
	})

	t.Run("should export several keys in one call", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		aes := kms.NewKey(t, proj)
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))

		// Action
		res, err := tn.Admin.API.BulkExportKmsKeyPrivateKeysWithBodyWithResponse(t.Context(), "application/json",
			kms.JSON(t, map[string]any{"keyIds": []uuid.UUID{aes.ID, signing.ID}}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		exported := map[uuid.UUID]exportedKey{}
		for _, k := range kms.Decode[struct{ Keys []exportedKey }](t, res.Body).Keys {
			exported[k.KeyID] = k
		}
		require.Len(t, exported, 2)
		require.Equal(t, kms.ExportPrivateKey(t, proj, aes.ID), unb64(t, exported[aes.ID].PrivateKey))
		require.Empty(t, exported[aes.ID].PublicKey)
		require.Equal(t, publicKey(t, proj, signing.ID), unb64(t, exported[signing.ID].PublicKey))
	})

	t.Run("should refuse a bulk export that mixes projects or includes a non-exportable key, returning nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj, other := newProject(t, tn), newProject(t, tn)
		exportable := kms.NewKey(t, proj)
		elsewhere := kms.NewKey(t, other)
		locked := kms.NewKey(t, proj, kms.NotExportable())
		cases := map[string]struct {
			keyIDs  []uuid.UUID
			message string
		}{
			"mixed projects": {[]uuid.UUID{exportable.ID, elsewhere.ID}, "All keys must belong to the same project"},
			"non-exportable": {[]uuid.UUID{exportable.ID, locked.ID}, "You are not allowed to export this key"},
		}

		for name, c := range cases {
			// Action
			res, err := tn.Admin.API.BulkExportKmsKeyPrivateKeysWithBodyWithResponse(t.Context(), "application/json",
				kms.JSON(t, map[string]any{"keyIds": c.keyIDs}))

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s: %s", name, apierr.Body(res.Body))
			require.Equalf(t, c.message, apierr.Message(res.Body), "%s", name)
			require.NotContainsf(t, string(res.Body), "privateKey", "%s", name)
		}
	})
}
