package ca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record a CA's creation, update and deletion with the admin and the CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ca := pki.NewInternalCA(t, pki.CertManager(t, tn))
		name := "renamed-" + id.Short()

		// Action
		upd, err := tn.Admin.API.UpdateInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String(), api.UpdateInternalCertificateAuthorityV1JSONRequestBody{
			Name:   &name,
			Status: new(api.UpdateInternalCertificateAuthorityV1JSONBodyStatusDisabled),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "updating the CA: %s", apierr.Body(upd.Body))
		del, err := tn.Admin.API.DeleteInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting the CA: %s", apierr.Body(del.Body))

		// Assert
		fixture.RequireAuditedBy(t, tn, tn.Admin, "create-certificate-authority", "caId", ca.ID.String())
		updated := fixture.RequireAuditedBy(t, tn, tn.Admin, "update-certificate-authority", "caId", ca.ID.String())
		require.Equal(t, name, updated["name"])
		require.Equal(t, string(api.UpdateInternalCertificateAuthorityV1JSONBodyStatusDisabled), updated["status"])
		fixture.RequireAuditedBy(t, tn, tn.Admin, "delete-certificate-authority", "caId", ca.ID.String())
	})
}
