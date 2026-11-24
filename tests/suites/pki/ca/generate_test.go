package ca_test

import (
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_GenerateCertificate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give a pending CA a certificate from its internal parent that reads back as requested", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		root := pki.NewInternalCA(t, proj)
		pending := pki.NewPendingIntermediateCA(t, proj)
		notBefore := time.Now().UTC().Truncate(time.Second)
		notAfter := notBefore.AddDate(1, 0, 0)

		// Action
		gen, err := tn.Admin.API.GenerateCaCertificateWithResponse(t.Context(), pending.ID.String(), api.GenerateCaCertificateJSONRequestBody{
			NotBefore:     notBefore.Format(time.RFC3339),
			NotAfter:      notAfter.Format(time.RFC3339),
			MaxPathLength: new(float32(0)),
			ParentCaId:    new(root.ID.String()),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, gen.JSON200, "generating the CA certificate returned %d: %s", gen.StatusCode(), apierr.Body(gen.Body))
		certID, err := uuid.Parse(gen.JSON200.CertId)
		require.NoError(t, err)
		got, err := tn.Admin.API.GetCaCertificateByIdWithResponse(t.Context(), pending.ID, certID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the CA certificate returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, gen.JSON200.SerialNumber, got.JSON200.SerialNumber)
		require.Equal(t, &root.ID, got.JSON200.ParentCaId)
		require.Equal(t, new(float32(0)), got.JSON200.MaxPathLength)
		require.Equal(t, new(notAfter.Format(time.RFC3339)), got.JSON200.NotAfter)
		leaf := pki.ParseLeaf(t, got.JSON200.Certificate)
		_, err = leaf.Verify(x509VerifyCA(pki.CACertificate(t, tn.Admin, root.ID)))
		require.NoError(t, err)
		require.Equal(t, "active", caStatus(t, tn.Admin.API, pending))
	})
}
