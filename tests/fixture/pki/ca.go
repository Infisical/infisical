package pki

import (
	"crypto/x509"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// CA is a certificate authority a profile issues from.
type CA struct{ ID uuid.UUID }

// NewInternalCA creates an active root CA on an RSA-2048 key.
func NewInternalCA(tt *testing.T, p *Project) CA {
	tt.Helper()
	return NewRootCA(tt, p, api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048)
}

// NewRootCA creates an active root CA on a key of the algorithm.
func NewRootCA(tt *testing.T, p *Project, keyAlgorithm api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithm) CA {
	tt.Helper()
	res := CreateRootCA(tt, p, keyAlgorithm)
	require.NotNilf(tt, res.JSON200, "creating an internal CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}
}

// CreateRootCA asks for an active root CA on a key of the algorithm and returns the
// response, whatever its status.
func CreateRootCA(tt *testing.T, p *Project, keyAlgorithm api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithm) *api.CreateInternalCertificateAuthorityV1Response {
	tt.Helper()
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "ca-" + id.Short(),
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = keyAlgorithm
	body.Configuration.Organization = new("Infisical Harness")
	body.Configuration.NotAfter = new(time.Now().AddDate(10, 0, 0).UTC().Format(time.RFC3339))
	body.Configuration.MaxPathLength = new(float32(-1))

	res, err := p.tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an internal CA")
	return res
}

// NewAcmeCA creates a CA that orders from an upstream ACME directory, answering its
// DNS-01 challenges in a zone of the DNS provider the connection reaches.
func NewAcmeCA(tt *testing.T, p *Project, dns *fixture.AppConnection, provider api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProvider, zoneID, directoryURL string) CA {
	tt.Helper()
	body := api.CreateAcmeCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "acme-ca-" + id.Short(),
		Status:    api.CreateAcmeCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.DnsAppConnectionId = dns.ID
	body.Configuration.DnsProviderConfig.Provider = provider
	body.Configuration.DnsProviderConfig.HostedZoneId = zoneID
	body.Configuration.DirectoryUrl = directoryURL
	body.Configuration.AccountEmail = "pki@harness.test"

	res, err := p.tn.Admin.API.CreateAcmeCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an ACME CA")
	require.NotNilf(tt, res.JSON200, "creating an ACME CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}
}

// NewPendingIntermediateCA creates an intermediate CA on an RSA-2048 key that waits
// for its certificate.
func NewPendingIntermediateCA(tt *testing.T, p *Project) CA {
	tt.Helper()
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "ca-" + id.Short(),
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusPendingCertificate,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeIntermediate
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048
	body.Configuration.Organization = new("Infisical Harness")
	body.Configuration.CommonName = new("Harness Intermediate " + id.Short())
	res, err := p.tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an intermediate CA")
	require.NotNilf(tt, res.JSON200, "creating an intermediate CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}
}

// PendingCSR reads the CSR of a CA that waits for its certificate.
func PendingCSR(tt *testing.T, p *Project, ca CA) string {
	tt.Helper()
	csr, err := p.tn.Admin.API.GetCaCsrWithResponse(tt.Context(), ca.ID.String(), nil)
	require.NoError(tt, err, "reading the intermediate's CSR")
	require.NotNilf(tt, csr.JSON200, "reading the intermediate's CSR returned %d: %s", csr.StatusCode(), apierr.Body(csr.Body))
	return csr.JSON200.Csr
}

// NewIntermediateCA creates an intermediate CA on an RSA-2048 key and installs a
// certificate the parent signs over its CSR, valid for a year.
func NewIntermediateCA(tt *testing.T, p *Project, parent CA) CA {
	tt.Helper()
	client := p.tn.Admin.API
	ca := NewPendingIntermediateCA(tt, p)

	signed, err := client.SignIntermediateCaWithResponse(tt.Context(), parent.ID.String(), api.SignIntermediateCaJSONRequestBody{
		Csr:      PendingCSR(tt, p, ca),
		NotAfter: time.Now().AddDate(1, 0, 0).UTC().Format(time.RFC3339),
	})
	require.NoError(tt, err, "signing the intermediate")
	require.NotNilf(tt, signed.JSON200, "signing the intermediate returned %d: %s", signed.StatusCode(), apierr.Body(signed.Body))

	imp, err := client.ImportCaCertificateWithResponse(tt.Context(), ca.ID.String(), api.ImportCaCertificateJSONRequestBody{
		Certificate:      signed.JSON200.Certificate,
		CertificateChain: signed.JSON200.CertificateChain,
	})
	require.NoError(tt, err, "installing the intermediate's certificate")
	require.Equalf(tt, http.StatusOK, imp.StatusCode(), "installing the intermediate's certificate: %s", apierr.Body(imp.Body))
	return ca
}

// CACertificate is the CA's active certificate, as `as` reads it.
func CACertificate(tt *testing.T, as *harness.Principal, ca uuid.UUID) *x509.Certificate {
	tt.Helper()
	res, err := as.API.GetCaCertificateWithResponse(tt.Context(), ca)
	require.NoError(tt, err, "reading the CA certificate")
	require.NotNilf(tt, res.JSON200, "reading the CA certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return ParseLeaf(tt, res.JSON200.Certificate)
}
