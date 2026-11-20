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

func TestKmsKey_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the key so it is no longer found and its ciphertext no longer decrypts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		ciphertext := kms.Encrypt(t, proj, key.ID, []byte("value"))

		// Action
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, keyNames(t, proj))
		get, err := tn.Admin.API.GetKmsKeyByIdWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, get.StatusCode(), get.Body)
		decrypt := kms.DecryptResponse(t, proj.Tenant().Admin.API, key.ID, ciphertext)
		requireStatus(t, http.StatusNotFound, decrypt.StatusCode(), decrypt.Body)
	})

	t.Run("should refuse and keep the key working while delete protection is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithDeleteProtection())

		// Action
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Key with ID "+key.ID.String()+" has delete protection enabled. Disable delete protection on the key before deleting it.",
			apierr.Message(res.Body))
		ciphertext := kms.Encrypt(t, proj, key.ID, []byte("still works"))
		require.Equal(t, []byte("still works"), kms.Decrypt(t, proj, key.ID, ciphertext))
	})

	t.Run("should delete the key once delete protection is turned off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithDeleteProtection())
		off, err := tn.Admin.API.UpdateKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"hasDeleteProtection": false}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, off.StatusCode(), off.Body)

		// Action
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, keyNames(t, proj))
	})

	t.Run("should refuse a viewer and keep the key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		key := kms.NewKey(t, proj, kms.WithName("kept"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to delete on cmek", apierr.Message(res.Body))
		require.Equal(t, []string{"kept"}, keyNames(t, proj))
	})
}
