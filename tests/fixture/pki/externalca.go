package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// AwsPcaCA is an AWS Private CA CA with the connection, account and Private CA behind it.
type AwsPcaCA struct {
	CA
	Conn *fixture.AppConnection
	Acct *aws.ControlPlane
	ARN  string
}

// NewAwsPcaCA is an active AWS Private CA CA on an active Private CA of a new connection's own.
func NewAwsPcaCA(tt *testing.T, p *Project) AwsPcaCA {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.AWSAccessKeyAppConnection)
	acct := aws.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	arn := aws.PrivateCAARN(conn.Nonce())
	acct.Seed(tt, aws.SeedPrivateCA(arn, "ACTIVE"))
	body := api.CreateAwsPcaCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "pca-" + id.Short(),
		Status:    api.CreateAwsPcaCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.CertificateAuthorityArn = arn
	body.Configuration.Region = api.CreateAwsPcaCertificateAuthorityV1JSONBodyConfigurationRegionUsEast1
	res, err := p.tn.Admin.API.CreateAwsPcaCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an AWS Private CA CA")
	require.NotNilf(tt, res.JSON200, "creating an AWS Private CA CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return AwsPcaCA{CA: CA{ID: res.JSON200.Id}, Conn: conn, Acct: acct, ARN: arn}
}

// AwsAcmPublicCA is an AWS ACM Public CA CA with the connection and account behind it,
// writing its validation records to a Route 53 hosted zone of the same account.
type AwsAcmPublicCA struct {
	CA
	Conn *fixture.AppConnection
	Acct *aws.ControlPlane
	// Zone is the hosted zone's id and ZoneName the domain it serves.
	Zone     string
	ZoneName string
}

// NewAwsAcmPublicCA is an active AWS ACM Public CA CA on a new connection's own account,
// with a hosted zone for a domain of its own.
func NewAwsAcmPublicCA(tt *testing.T, p *Project) AwsAcmPublicCA {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.AWSAccessKeyAppConnection)
	acct := aws.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	zoneName := id.Short() + ".acm.test"
	zone := "Z" + id.Short()
	acct.Seed(tt, aws.SeedHostedZone(zone, zoneName))
	body := api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "acm-" + id.Short(),
		Status:    api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.DnsAppConnectionId = conn.ID
	body.Configuration.HostedZoneId = zone
	body.Configuration.Region = api.CreateAwsAcmPublicCaCertificateAuthorityV1JSONBodyConfigurationRegionUsEast1
	res, err := p.tn.Admin.API.CreateAwsAcmPublicCaCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an AWS ACM Public CA CA")
	require.NotNilf(tt, res.JSON200, "creating an AWS ACM Public CA CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return AwsAcmPublicCA{CA: CA{ID: res.JSON200.Id}, Conn: conn, Acct: acct, Zone: zone, ZoneName: zoneName}
}

// AcmCertificate is a request for a server certificate for name, valid for the fixed
// validity ACM issues, which is the only one it accepts.
func AcmCertificate(name string) api.CreateCertificateJSONRequestBody {
	body := ServerCertificate(name)
	body.Attributes.Ttl = new("198d")
	return body
}

// NewAzureADCSCA is an active Azure AD CS CA on a fake certsrv of a new connection's own.
func NewAzureADCSCA(tt *testing.T, p *Project) (CA, *azureadcs.ControlPlane) {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.AzureADCSPasswordAppConnection)
	adcs := azureadcs.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	body := api.CreateAzureAdCsCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "adcs-" + id.Short(),
		Status:    api.CreateAzureAdCsCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AzureAdcsConnectionId = conn.ID
	res, err := p.tn.Admin.API.CreateAzureAdCsCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating an Azure AD CS CA")
	require.NotNilf(tt, res.JSON200, "creating an Azure AD CS CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}, adcs
}

// DigiCertOrganization is the organization NewDigiCertCA seeds and orders under.
const DigiCertOrganization = 4242

// NewDigiCertCA is an active DigiCert CA ordering ssl_plus certificates under
// DigiCertOrganization, on a fake CertCentral account of a new connection's own.
func NewDigiCertCA(tt *testing.T, p *Project) (CA, *digicert.ControlPlane) {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.DigiCertAPIKeyAppConnection)
	dc := digicert.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	dc.Seed(tt, digicert.WithOrganization(DigiCertOrganization))
	body := api.CreateDigicertCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "digicert-" + id.Short(),
		Status:    api.CreateDigicertCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.OrganizationId = DigiCertOrganization
	body.Configuration.ProductNameId = "ssl_plus"
	res, err := p.tn.Admin.API.CreateDigicertCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a DigiCert CA")
	require.NotNilf(tt, res.JSON200, "creating a DigiCert CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}, dc
}

// NewGoDaddyCA is an active GoDaddy CA ordering DV SSL certificates, on a fake GoDaddy
// account of a new connection's own.
func NewGoDaddyCA(tt *testing.T, p *Project) (CA, *godaddy.ControlPlane) {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.GoDaddyAPIKeyAppConnection)
	gd := godaddy.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	body := api.CreateGodaddyCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      "godaddy-" + id.Short(),
		Status:    api.CreateGodaddyCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.ProductType = api.CreateGodaddyCertificateAuthorityV1JSONBodyConfigurationProductTypeDVSSL
	res, err := p.tn.Admin.API.CreateGodaddyCertificateAuthorityV1WithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a GoDaddy CA")
	require.NotNilf(tt, res.JSON200, "creating a GoDaddy CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return CA{ID: res.JSON200.Id}, gd
}
