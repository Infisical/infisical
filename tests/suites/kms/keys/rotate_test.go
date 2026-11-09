package keys_test

import (
	"net/http"
	"sort"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_Rotate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should bump the version and still decrypt ciphertext made before the rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		before := kms.Encrypt(t, proj, key.ID, []byte("before"))

		// Action
		res, err := tn.Admin.API.RotateKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, 2, kms.Decode[struct{ Key kms.Key }](t, res.Body).Key.Version)
		require.Equal(t, []byte("before"), kms.Decrypt(t, proj, key.ID, before))
		after := kms.Encrypt(t, proj, key.ID, []byte("after"))
		require.Equal(t, []byte("after"), kms.Decrypt(t, proj, key.ID, after))
	})

	t.Run("should export different material after rotation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		before := kms.ExportPrivateKey(t, proj, key.ID)

		// Action
		res, err := tn.Admin.API.RotateKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		after := kms.ExportPrivateKey(t, proj, key.ID)
		require.Len(t, after, 32)
		require.NotEqual(t, before, after)
	})

	t.Run("should give distinct consecutive versions when rotated concurrently, with earlier ciphertext still decrypting", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		before := kms.Encrypt(t, proj, key.ID, []byte("before"))

		// Action
		var wg sync.WaitGroup
		statuses, bodies, errs := make([]int, 2), make([][]byte, 2), make([]error, 2)
		for i := range 2 {
			wg.Go(func() {
				res, err := tn.Admin.API.RotateKmsKeyWithResponse(t.Context(), key.ID)
				errs[i] = err
				if err == nil {
					statuses[i], bodies[i] = res.StatusCode(), res.Body
				}
			})
		}
		wg.Wait()

		// Assert
		require.Equal(t, []error{nil, nil}, errs)
		require.Equal(t, []int{http.StatusOK, http.StatusOK}, statuses)
		versions := []int{kms.Decode[struct{ Key kms.Key }](t, bodies[0]).Key.Version, kms.Decode[struct{ Key kms.Key }](t, bodies[1]).Key.Version}
		sort.Ints(versions)
		require.Equal(t, []int{2, 3}, versions)
		require.Equal(t, 3, kms.GetKey(t, proj, key.ID).Version)
		require.Equal(t, []byte("before"), kms.Decrypt(t, proj, key.ID, before))
	})

	t.Run("should refuse rotating sign-verify and MAC keys with the message that explains why", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))
		mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))

		for _, key := range []kms.Key{signing, mac} {
			// Action
			res, err := tn.Admin.API.RotateKmsKeyWithResponse(t.Context(), key.ID)

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equal(t, "Only encrypt-decrypt keys support rotation. To rotate a sign-verify or MAC key, create a new key and update your applications to use it.",
				apierr.Message(res.Body))
			require.Equal(t, 1, kms.GetKey(t, proj, key.ID).Version)
		}
	})

	t.Run("should refuse rotating a disabled key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		setDisabled(t, proj, key.ID, true)

		// Action
		res, err := tn.Admin.API.RotateKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Key is disabled", apierr.Message(res.Body))
		require.Equal(t, 1, kms.GetKey(t, proj, key.ID).Version)
	})
}
