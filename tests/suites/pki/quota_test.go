package pki_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateQuota_Import(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a new name past the plan's certificate cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxCertificates, 1)))
		requireImported(t, importCert(t, tn.Admin.API, "a.quota.test"))

		// Action
		res := importCert(t, tn.Admin.API, "b.quota.test")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "plan limit reached (1 of 1")
	})

	t.Run("should let a name that is already active through at the cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxCertificates, 1)))
		requireImported(t, importCert(t, tn.Admin.API, "same.quota.test"))

		// Action
		res := importCert(t, tn.Admin.API, "same.quota.test")

		// Assert
		requireImported(t, res)
	})

	t.Run("should refuse a wildcard past the plan's wildcard cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxWildcardCertificates, 1)))
		requireImported(t, importCert(t, tn.Admin.API, "*.a.quota.test"))

		// Action
		res := importCert(t, tn.Admin.API, "*.b.quota.test")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "wildcard")
	})

	t.Run("should count a sub-org's certificates against the root org's cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxCertificates, 1)))
		sub := fixture.NewSubOrg(t, tn)
		requireImported(t, importCert(t, tn.Admin.API, "root.quota.test"))

		// Action
		res := importCert(t, sub.Admin.API, "sub.quota.test")

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "plan limit reached (1 of 1")
	})
}

func TestCertificateUsage_Report(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report active certificates at the root org when a sub-org imports one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())

		// Action
		requireImported(t, importCert(t, sub.Admin.API, "reported.quota.test"))

		// Assert
		root.ExpectEvent[license.SnapshotReceived](t, func(e license.SnapshotReceived) bool {
			return e.Dimension == "active_certs" && e.Value == 1
		}, fakenet.Within(30*time.Second))
	})
}

// An internal cap above the total cap raises the total, so every plan here sets both.
func TestCertificateAuthorityQuota_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report the CAs in use against the plan's cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxCAs, 3).With(license.MaxInternalCAs, 3)))
		createRootCA(t, tn.Admin.API)

		// Action
		res, err := tn.Admin.API.GetCertificateAuthorityQuotaV1WithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "answered %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, 1, res.JSON200.CertificateAuthorities.Used)
		require.Equal(t, 3, *res.JSON200.CertificateAuthorities.Limit)
	})

	t.Run("should refuse a CA past the plan's cap", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.MaxCAs, 1).With(license.MaxInternalCAs, 1)))
		createRootCA(t, tn.Admin.API)

		// Action
		res := createCA(t, tn.Admin.API)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "plan limit reached (1 of 1 certificate authorities)")
	})
}

func importCert(t *testing.T, client *api.ClientWithResponses, commonName string) *api.ImportCertificateResponse {
	t.Helper()
	res, err := client.ImportCertificateWithResponse(t.Context(), api.ImportCertificateJSONRequestBody{
		CertificatePem: selfSigned(t, commonName),
	})
	require.NoError(t, err)
	return res
}

func requireImported(t *testing.T, res *api.ImportCertificateResponse) {
	t.Helper()
	require.Equalf(t, http.StatusOK, res.StatusCode(), "importing a certificate: %s", apierr.Body(res.Body))
}

func createCA(t *testing.T, client *api.ClientWithResponses) *api.CreateInternalCertificateAuthorityV1Response {
	t.Helper()
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		Name:   "ca-" + id.Short(),
		Status: api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECPrime256v1
	body.Configuration.CommonName = new("Quota Root")
	res, err := client.CreateInternalCertificateAuthorityV1WithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

func createRootCA(t *testing.T, client *api.ClientWithResponses) {
	t.Helper()
	res := createCA(t, client)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating a CA: %s", apierr.Body(res.Body))
}

func selfSigned(t *testing.T, commonName string) string {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	serial, err := rand.Int(rand.Reader, big.NewInt(1<<62))
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: commonName},
		DNSNames:     []string{commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
}
