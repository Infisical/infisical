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

func TestInternalCA_Disable(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse to issue from a disabled CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		upd, err := tn.Admin.API.UpdateInternalCertificateAuthorityV1WithResponse(t.Context(), g.CA.ID.String(), api.UpdateInternalCertificateAuthorityV1JSONRequestBody{
			Status: new(api.UpdateInternalCertificateAuthorityV1JSONBodyStatusDisabled),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "disabling answered: %s", apierr.Body(upd.Body))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".disabled.test"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "CA is not active", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}
