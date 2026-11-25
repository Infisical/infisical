package scheduled_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// expiringRootCA is a root CA issued 60 days ago that expires in 5, so a renew-before
// window of 10 days is already open.
func expiringRootCA(t *testing.T, tn *harness.Tenant, proj *pki.Project) pki.CA {
	t.Helper()
	now := time.Now().UTC()
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &proj.ID,
		Name:      "ca-" + id.Short(),
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048
	body.Configuration.CommonName = new("Expiring Root " + id.Short())
	body.Configuration.NotBefore = new(now.AddDate(0, 0, -60).Format("2006-01-02T15:04:05.000Z"))
	body.Configuration.NotAfter = new(now.AddDate(0, 0, 5).Format("2006-01-02T15:04:05.000Z"))
	body.Configuration.MaxPathLength = new(float32(-1))
	res, err := tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a root CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return pki.CA{ID: res.JSON200.Id}
}

func TestCaAutoRenewalJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should renew a CA inside its renew-before window with a certificate valid as long as the old one", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		ca := expiringRootCA(t, tn, pki.CertManager(t, tn))
		before := pki.CACertificate(t, tn.Admin, ca.ID)
		res, err := tn.Admin.API.UpdateCaAutoRenewalConfigWithResponse(t.Context(), ca.ID.String(), api.UpdateCaAutoRenewalConfigJSONRequestBody{
			AutoRenewalEnabled:          new(true),
			AutoRenewalDaysBeforeExpiry: new(float32(10)),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "turning auto-renewal on returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Action
		runJob(t, h, api.CaDailyAutoRenewal)

		// Assert
		cfg := pki.Poll(t, "reading the CA's auto-renewal config", func(ctx context.Context) (*api.GetCaAutoRenewalConfigResponse, int, []byte, error) {
			res, status, body, err := pki.ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
				return tn.Admin.API.GetCaAutoRenewalConfig(ctx, ca.ID.String())
			}, api.ParseGetCaAutoRenewalConfigResponse)
			if err == nil && status == http.StatusOK && res.JSON200 == nil {
				err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
			}
			return res, status, body, err
		}, func(res *api.GetCaAutoRenewalConfigResponse) bool { return res.JSON200.LastRenewalStatus != nil })
		require.Equal(t, "success", *cfg.JSON200.LastRenewalStatus, "message: %v", cfg.JSON200.LastRenewalMessage)
		after := pki.CACertificate(t, tn.Admin, ca.ID)
		require.NotEqual(t, before.SerialNumber, after.SerialNumber)
		require.WithinDuration(t, time.Now().Add(before.NotAfter.Sub(before.NotBefore)), after.NotAfter, time.Hour)
	})
}
