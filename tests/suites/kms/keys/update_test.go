package keys_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should rename the key and keep its material, so old ciphertext still decrypts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithName("before"))
		ciphertext := kms.Encrypt(t, proj, key.ID, []byte("card-number"))

		// Action
		res, err := tn.Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"name": "after"}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "after", kms.GetKey(t, proj, key.ID).Name)
		require.Equal(t, []byte("card-number"), kms.Decrypt(t, proj, key.ID, ciphertext))
	})

	t.Run("should refuse and keep the name when renaming to a name already in the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		kms.NewKey(t, proj, kms.WithName("taken"))
		key := kms.NewKey(t, proj, kms.WithName("mine"))

		// Action
		res, err := tn.Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"name": "taken"}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, `A KMS key with the name "taken" already exists for the project with ID "`+proj.ID+`"`, apierr.Message(res.Body))
		require.Equal(t, "mine", kms.GetKey(t, proj, key.ID).Name)
	})

	t.Run("should refuse every operation while the key is disabled, and allow them again once re-enabled", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		aes := kms.NewKey(t, proj)
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))
		mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
		ciphertext := kms.Encrypt(t, proj, aes.ID, []byte("value"))
		ops := keyOperations()
		sweep := func() map[string]int {
			statuses := map[string]int{}
			statuses["encrypt"], _ = ops["encrypt"](t, tn.Admin.API, aes.ID)
			statuses["decrypt"] = kms.DecryptResponse(t, proj.Tenant().Admin.API, aes.ID, ciphertext).StatusCode()
			statuses["sign"], _ = signWith(t, tn.Admin.API, signing.ID, "ED25519")
			statuses["generate mac"], _ = ops["generate mac"](t, tn.Admin.API, mac.ID)
			return statuses
		}
		for _, k := range []kms.Key{aes, signing, mac} {
			setDisabled(t, proj, k.ID, true)
		}

		// Action
		whileDisabled := sweep()
		for _, k := range []kms.Key{aes, signing, mac} {
			setDisabled(t, proj, k.ID, false)
		}
		afterEnabling := sweep()

		// Assert
		require.Equal(t, map[string]int{
			"encrypt": http.StatusBadRequest, "decrypt": http.StatusBadRequest,
			"sign": http.StatusBadRequest, "generate mac": http.StatusBadRequest,
		}, whileDisabled)
		require.Equal(t, map[string]int{
			"encrypt": http.StatusOK, "decrypt": http.StatusOK, "sign": http.StatusOK, "generate mac": http.StatusOK,
		}, afterEnabling)
	})

	t.Run("should keep a non-exportable key non-exportable when an update asks for export", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.NotExportable())

		// Action
		res, err := tn.Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"description": "now exportable?", "isExportable": true}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.False(t, kms.GetKey(t, proj, key.ID).IsExportable)
		export, err := tn.Admin.API.GetKmsKeyPrivateKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, export.StatusCode(), export.Body)
	})

	t.Run("should refuse an empty update with 422 and leave the key unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)

		// Action
		res, err := tn.Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json", kms.JSON(t, map[string]any{}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "At least one field is required")
		require.Equal(t, key, kms.GetKey(t, proj, key.ID))
	})

	t.Run("should refuse a viewer and leave the key unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		key := kms.NewKey(t, proj, kms.WithName("unchanged"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"name": "changed", "isDisabled": true}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to edit on cmek", apierr.Message(res.Body))
		require.Equal(t, key, kms.GetKey(t, proj, key.ID))
	})
}
