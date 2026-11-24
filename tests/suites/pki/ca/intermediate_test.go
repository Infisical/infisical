package ca_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_SignIntermediate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should activate an intermediate whose certificate the root signed, chaining to the root with the path length asked for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		root := pki.NewInternalCA(t, p)
		inter := pki.NewPendingIntermediateCA(t, p)
		csr := pki.PendingCSR(t, p, inter)
		signed, err := tn.Admin.API.SignIntermediateCaWithResponse(t.Context(), root.ID.String(), api.SignIntermediateCaJSONRequestBody{
			Csr:           csr,
			NotAfter:      time.Now().AddDate(1, 0, 0).UTC().Format(time.RFC3339),
			MaxPathLength: new(float32(0)),
		})
		require.NoError(t, err)
		require.NotNilf(t, signed.JSON200, "signing returned %d: %s", signed.StatusCode(), apierr.Body(signed.Body))

		// Action
		res, err := tn.Admin.API.ImportCaCertificateWithResponse(t.Context(), inter.ID.String(), api.ImportCaCertificateJSONRequestBody{
			Certificate:      signed.JSON200.Certificate,
			CertificateChain: signed.JSON200.CertificateChain,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "importing answered: %s", apierr.Body(res.Body))
		cert := pki.CACertificate(t, tn.Admin, inter.ID)
		_, err = cert.Verify(x509VerifyCA(pki.CACertificate(t, tn.Admin, root.ID)))
		require.NoError(t, err)
		require.True(t, cert.MaxPathLenZero)
		require.Equal(t, 0, cert.MaxPathLen)
		require.Equal(t, "active", caStatus(t, tn.Admin.API, inter))
	})

	t.Run("should refuse to sign an intermediate past the root's expiry and leave it pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		root := pki.NewInternalCA(t, p)
		inter := pki.NewPendingIntermediateCA(t, p)
		csr := pki.PendingCSR(t, p, inter)
		pastRoot := pki.CACertificate(t, tn.Admin, root.ID).NotAfter.AddDate(0, 0, 1)

		// Action
		res, err := tn.Admin.API.SignIntermediateCaWithResponse(t.Context(), root.ID.String(), api.SignIntermediateCaJSONRequestBody{
			Csr:      csr,
			NotAfter: pastRoot.UTC().Format(time.RFC3339),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "notAfter date is after CA certificate's notAfter date", apierr.Message(res.Body))
		require.Equal(t, "pending-certificate", caStatus(t, tn.Admin.API, inter))
	})
}
