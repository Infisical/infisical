package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// OpenUpstreamCA is a fake upstream ACME CA of the tenant's own.
func OpenUpstreamCA(tt *testing.T, tn *harness.Tenant) *acmeca.ControlPlane {
	tt.Helper()
	scope := id.Nonce()
	admin := fixture.FakenetAdmin(tt, tn)
	fakenet.Track(tt, admin, acmeca.Service.Host(), scope)
	return acmeca.Open(tt, admin, scope)
}

// NewCloudflareAcmeCA is an ACME CA ordering from a fake upstream CA and answering its
// DNS-01 challenges in a Cloudflare zone.
func NewCloudflareAcmeCA(tt *testing.T, p *Project) (CA, *acmeca.ControlPlane, *cloudflare.ControlPlane) {
	tt.Helper()
	conn := fixture.NewAppConnection(tt, p.tn, fixture.CloudflareAPITokenAppConnection)
	zone := id.Nonce()
	dns := cloudflare.Open(tt, conn.FakenetAdmin(tt), conn.Nonce())
	dns.Seed(tt, cloudflare.WithZone(zone))
	up := OpenUpstreamCA(tt, p.tn)
	return NewAcmeCA(tt, p, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderCloudflare, zone, up.DirectoryURL()), up, dns
}
