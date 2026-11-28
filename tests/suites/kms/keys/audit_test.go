package keys_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record key creation, private key export and deletion with the actor and the key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)

		// Action
		key := kms.NewKey(t, proj)
		kms.ExportPrivateKey(t, proj, key.ID)
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		for _, eventType := range []string{"create-cmek", "cmek-get-private-key", "delete-cmek"} {
			fixture.RequireAuditedBy(t, tn, tn.Admin, eventType, "keyId", key.ID.String())
		}
	})

	t.Run("should not record a refused deletion as a deletion", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj)
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		refused, err := viewer.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, refused.StatusCode(), "%s", apierr.Body(refused.Body))

		// Action
		res, err := tn.Admin.API.DeleteKmsKeyWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Assert
		spec.Why(t, "the refused delete came first, so once the admin's delete is logged a recorded refusal would be too")
		fixture.RequireAuditedBy(t, tn, tn.Admin, "delete-cmek", "keyId", key.ID.String())
	})
}
