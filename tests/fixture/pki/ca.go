package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
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
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "ca-" + id.Short(),
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmRSA2048
	body.Configuration.Organization = new("Infisical Harness")
	body.Configuration.NotAfter = new("2035-11-07")
	body.Configuration.MaxPathLength = new(float32(-1))

	res, err := p.tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an internal CA")
	require.NotNilf(tt, res.JSON200, "creating an internal CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}
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
