package syncs_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestPkiSync_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record a sync's creation, update and deletion with the admin, the destination and the application", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Every destination's create, update and delete routes come from one factory, so ACM stands for all of them.")

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, nil, cert)
		name := "acm-renamed-" + id.Short()

		// Action
		upd, err := tn.Admin.API.UpdateAwsCertificateManagerPkiSyncWithResponse(t.Context(), s.id, api.UpdateAwsCertificateManagerPkiSyncJSONRequestBody{Name: &name})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "updating the sync: %s", apierr.Body(upd.Body))
		del, err := tn.Admin.API.DeleteAwsCertificateManagerPkiSyncWithResponse(t.Context(), s.id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting the sync: %s", apierr.Body(del.Body))

		// Assert
		created := fixture.RequireAuditedBy(t, tn, tn.Admin, "create-pki-sync", "pkiSyncId", s.id)
		require.Equal(t, "aws-certificate-manager", created["destination"])
		require.Equal(t, s.conn.ID.String(), created["connectionId"])
		require.Equal(t, g.App.ID.String(), created["applicationId"])
		updated := fixture.RequireAuditedBy(t, tn, tn.Admin, "update-pki-sync", "pkiSyncId", s.id)
		require.Equal(t, name, updated["name"])
		deleted := fixture.RequireAuditedBy(t, tn, tn.Admin, "delete-pki-sync", "pkiSyncId", s.id)
		require.Equal(t, "aws-certificate-manager", deleted["destination"])
	})
}
