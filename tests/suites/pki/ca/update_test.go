package ca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back a new name and status after an update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ca := pki.NewInternalCA(t, pki.CertManager(t, tn))
		name := "renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String(), api.UpdateInternalCertificateAuthorityV1JSONRequestBody{
			Name:   &name,
			Status: new(api.UpdateInternalCertificateAuthorityV1JSONBodyStatusDisabled),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the CA: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the CA returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, name, got.JSON200.Name)
		require.Equal(t, "disabled", string(got.JSON200.Status))
	})
}
