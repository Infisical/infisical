package scheduled_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// importExpired imports into the application a certificate made outside Infisical that
// expired at notAfter, and returns its id.
func importExpired(t *testing.T, as *harness.Principal, app pki.Application, notAfter time.Time) uuid.UUID {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(time.Now().UnixNano()),
		Subject:               pkix.Name{CommonName: "Expired Root " + id.Short()},
		NotBefore:             notAfter.AddDate(0, 0, -30),
		NotAfter:              notAfter,
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	res, err := as.API.ImportCertificateWithResponse(t.Context(), api.ImportCertificateJSONRequestBody{
		ApplicationId:  &app.ID,
		CertificatePem: string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "importing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.CertificateId
}

func TestCertificateCleanupJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should delete a certificate expired longer than the retention period and keep one expired within it", func(t *testing.T) {
		spec.Why(t, "The rule as observed: a certificate goes once its notAfter is more than postExpiryRetentionDays ago.")

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		old := importExpired(t, tn.Admin, g.App, time.Now().AddDate(0, 0, -5))
		recent := importExpired(t, tn.Admin, g.App, time.Now().Add(-time.Hour))
		res, err := tn.Admin.API.UpdateCertificateCleanupConfigWithResponse(t.Context(), api.UpdateCertificateCleanupConfigJSONRequestBody{
			ProjectId:               new(g.Project.ID.String()),
			IsEnabled:               new(true),
			PostExpiryRetentionDays: new(1),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "turning cleanup on returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Action
		runJob(t, h, api.CertificateCleanup)

		// Assert
		gone, err := tn.Admin.API.GetCertificateWithResponse(t.Context(), old, nil)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, gone.StatusCode(), "reading the deleted certificate answered: %s", apierr.Body(gone.Body))
		require.Equal(t, recent, pki.ReadCertificate(t, tn.Admin, recent).JSON200.Certificate.Id)
		cfg, err := tn.Admin.API.GetCertificateCleanupConfigWithResponse(t.Context(), &api.GetCertificateCleanupConfigParams{ProjectId: new(g.Project.ID.String())})
		require.NoError(t, err)
		require.NotNilf(t, cfg.JSON200, "reading the cleanup config returned %d: %s", cfg.StatusCode(), apierr.Body(cfg.Body))
		require.NotNil(t, cfg.JSON200.Config)
		require.Equal(t, new(float32(1)), cfg.JSON200.Config.LastRunCertsDeleted)
	})

	t.Run("should keep expired certificates when cleanup is off", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		old := importExpired(t, tn.Admin, g.App, time.Now().AddDate(0, 0, -5))

		// Action
		runJob(t, h, api.CertificateCleanup)

		// Assert
		require.Equal(t, old, pki.ReadCertificate(t, tn.Admin, old).JSON200.Certificate.Id)
	})
}
