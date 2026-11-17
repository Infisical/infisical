package crypto_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_EncryptDecrypt(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should round-trip plaintext with aes-256-gcm and aes-128-gcm keys, including empty plaintext, and log each call", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		keys := []kms.Key{kms.NewKey(t, proj), kms.NewKey(t, proj, kms.WithAlgorithm("aes-128-gcm"))}

		for _, key := range keys {
			for _, plaintext := range [][]byte{[]byte("4111 1111 1111 1111"), {}} {
				// Action
				ciphertext := kms.Encrypt(t, proj, key.ID, plaintext)

				// Assert
				require.Equalf(t, plaintext, kms.Decrypt(t, proj, key.ID, ciphertext), "%s", key.Algorithm)
			}
		}
		for _, eventType := range []string{"cmek-encrypt", "cmek-decrypt"} {
			events := fixture.WaitForAuditEvents(t, tn, eventType, 2, func(e fixture.AuditEvent) bool {
				return e.Metadata["keyId"] == keys[0].ID.String()
			})
			require.Lenf(t, events, 2, "%s", eventType)
			require.Equalf(t, tn.Admin.ID.String(), events[0].Actor["userId"], "%s", eventType)
		}
	})

	t.Run("should produce different ciphertext for the same plaintext", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		key := kms.NewKey(t, proj)

		// Action
		first, second := kms.Encrypt(t, proj, key.ID, []byte("same")), kms.Encrypt(t, proj, key.ID, []byte("same"))

		// Assert
		require.NotEqual(t, first, second)
	})

	t.Run("should refuse encrypting with a sign-verify or MAC key, naming the usage it needs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))
		mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))

		for _, key := range []kms.Key{signing, mac} {
			// Action
			res, err := tn.Admin.API.EncryptWithKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
				kms.JSON(t, map[string]any{"plaintext": b64([]byte("value"))}))

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equal(t, "Unsupported key type, expected encrypt-decrypt but got "+key.KeyUsage, apierr.Message(res.Body))
		}
	})

	t.Run("should refuse plaintext that is not base64, and plaintext over 1 MiB", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		encrypt := func(plaintext string) (int, string) {
			res, err := tn.Admin.API.EncryptWithKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
				kms.JSON(t, map[string]any{"plaintext": plaintext}))
			require.NoError(t, err)
			return res.StatusCode(), string(res.Body)
		}

		// Action
		notBase64Status, notBase64Body := encrypt("not base64!")
		tooLargeStatus, tooLargeBody := encrypt(b64(bytes.Repeat([]byte{1}, 1024*1024+1)))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, notBase64Status)
		require.Contains(t, notBase64Body, "data must be base64 encoded")
		require.Equal(t, http.StatusUnprocessableEntity, tooLargeStatus)
		require.Contains(t, tooLargeBody, "data cannot exceed 1048576 bytes")
	})

	t.Run("should refuse with a readable 400 when ciphertext came from another key or was modified", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		key, other := kms.NewKey(t, proj), kms.NewKey(t, proj)
		own := kms.Encrypt(t, proj, key.ID, []byte("value"))
		foreign := kms.Encrypt(t, proj, other.ID, []byte("value"))
		raw := unb64(t, own)
		raw[0] ^= 0xff
		tampered := b64(raw)

		for name, ciphertext := range map[string]string{"another key's": foreign, "modified": tampered, "too short": b64([]byte("x"))} {
			// Action
			res := kms.DecryptResponse(t, proj.Tenant().Admin.API, key.ID, ciphertext)

			// Assert
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equalf(t, "The ciphertext could not be decrypted with this key. Check that it was encrypted with this key and has not been modified.",
				apierr.Message(res.Body), "%s ciphertext", name)
		}
		require.Equal(t, []byte("value"), kms.Decrypt(t, proj, key.ID, own))
	})
}
