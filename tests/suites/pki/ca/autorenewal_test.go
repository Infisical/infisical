package ca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_AutoRenewalConfig(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep auto-renewal on with the renew-before window it was given", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := pki.NewInternalCA(t, pki.CertManager(t, tn))

		// Action
		res, err := tn.Admin.API.UpdateCaAutoRenewalConfigWithResponse(t.Context(), root.ID.String(), api.UpdateCaAutoRenewalConfigJSONRequestBody{
			AutoRenewalEnabled:          new(true),
			AutoRenewalDaysBeforeExpiry: new(float32(30)),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCaAutoRenewalConfigWithResponse(t.Context(), root.ID.String())
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading answered %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.True(t, got.JSON200.AutoRenewalEnabled)
		require.Equal(t, new(float32(30)), got.JSON200.AutoRenewalDaysBeforeExpiry)
	})
}
