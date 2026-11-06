package scep_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestScepCapabilities_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should advertise POST, SHA-256, SHA-1, AES, 3DES, SCEPStandard and renewal as plain text", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")

		// Action
		res := p.operation(t, "GetCACaps", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Contains(t, res.HTTPResponse.Header.Get("Content-Type"), "text/plain")
		for _, capability := range []string{"POSTPKIOperation", "SHA-256", "SHA-1", "AES", "DES3", "SCEPStandard", "Renewal"} {
			require.Contains(t, string(res.Body), capability)
		}
	})

	t.Run("should not advertise renewal when certificate-based renewal is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123", pki.WithoutRenewal())

		// Action
		res := p.operation(t, "GetCACaps", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.NotContains(t, string(res.Body), "Renewal")
	})

	t.Run("should refuse an operation SCEP does not define", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")

		// Action
		res := p.operation(t, "BadOperation", nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
	})

	t.Run("should answer 404 for a profile that does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetScepOperationWithResponse(t.Context(), uuid.New(), &api.GetScepOperationParams{Operation: "GetCACaps"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
	})
}
