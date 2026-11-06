package scep_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestScepCACert_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the RA certificate followed by the CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123")

		// Action
		res := p.operation(t, "GetCACert", nil)

		// Assert
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Contains(t, res.HTTPResponse.Header.Get("Content-Type"), "application/x-x509-ca-ra-cert")
		certs := p.caCerts(t)
		require.GreaterOrEqual(t, len(certs), 2)
		require.Contains(t, certs[0].Subject.CommonName, "Infisical SCEP RA")
	})

	t.Run("should return only the RA certificate when the CA is left out", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, "testpassword123", pki.WithoutCACert())

		// Action
		certs := p.caCerts(t)

		// Assert
		require.Len(t, certs, 1)
		require.Contains(t, certs[0].Subject.CommonName, "Infisical SCEP RA")
	})
}
