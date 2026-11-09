package crypto_test

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"hash"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func generateMac(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, data []byte) (*api.GenerateMacWithKmsKeyResponse, []byte) {
	t.Helper()
	res, err := client.GenerateMacWithKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json",
		kms.JSON(t, map[string]any{"data": b64(data)}))
	require.NoError(t, err)
	if res.StatusCode() != http.StatusOK {
		return res, nil
	}
	return res, unb64(t, kms.Decode[struct{ Mac string }](t, res.Body).Mac)
}

func verifyMac(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID, data, mac []byte) bool {
	t.Helper()
	res, err := client.VerifyMacWithKmsKeyWithBodyWithResponse(t.Context(), keyID, "application/json",
		kms.JSON(t, map[string]any{"data": b64(data), "mac": b64(mac)}))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return kms.Decode[struct{ MacValid bool }](t, res.Body).MacValid
}

func TestKmsKey_Mac(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	hashes := map[string]func() hash.Hash{
		"HMAC_SHA_1": sha1.New, "HMAC_SHA_224": sha256.New224, "HMAC_SHA_256": sha256.New,
		"HMAC_SHA_384": sha512.New384, "HMAC_SHA_512": sha512.New,
	}

	t.Run("should generate a MAC that verifies and matches crypto/hmac with the exported key, for each HMAC algorithm", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		data := []byte("webhook payload")

		for algorithm, newHash := range hashes {
			key := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm(algorithm))

			// Action
			res, mac := generateMac(t, tn.Admin.API, key.ID, data)

			// Assert
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			require.Truef(t, verifyMac(t, tn.Admin.API, key.ID, data, mac), "%s", algorithm)
			local := hmac.New(newHash, kms.ExportPrivateKey(t, proj, key.ID))
			local.Write(data)
			require.Equalf(t, local.Sum(nil), mac, "%s", algorithm)
		}
	})

	t.Run("should report the MAC invalid for changed data or a MAC from another key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
		other := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
		_, mac := generateMac(t, tn.Admin.API, key.ID, []byte("original"))
		_, otherMac := generateMac(t, tn.Admin.API, other.ID, []byte("original"))

		// Action
		changedData := verifyMac(t, tn.Admin.API, key.ID, []byte("changed"), mac)
		otherKey := verifyMac(t, tn.Admin.API, key.ID, []byte("original"), otherMac)

		// Assert
		require.False(t, changedData)
		require.False(t, otherKey)
	})

	t.Run("should refuse MAC operations on a key that is not a MAC key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)

		// Action
		generate, _ := generateMac(t, tn.Admin.API, key.ID, []byte("data"))
		verifyRes, err := tn.Admin.API.VerifyMacWithKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"data": b64([]byte("data")), "mac": b64([]byte("mac"))}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, generate.StatusCode(), generate.Body)
		require.Equal(t, "Key with ID '"+key.ID.String()+"' is not intended for MAC generation", apierr.Message(generate.Body))
		requireStatus(t, http.StatusBadRequest, verifyRes.StatusCode(), verifyRes.Body)
		require.Equal(t, "Key with ID '"+key.ID.String()+"' is not intended for MAC verification", apierr.Message(verifyRes.Body))
	})
}
