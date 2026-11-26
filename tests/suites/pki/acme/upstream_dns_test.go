package acme_test

import (
	"net/http"
	"path"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fakes/powerdns"
	"github.com/Infisical/infisical/tests/fakes/ultradns"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// challengeRecords waits on a DNS provider fake for the DNS-01 record of an identifier
// to be written to the CA's zone, and then removed.
type challengeRecords struct {
	created func(t *testing.T, identifier string)
	deleted func(t *testing.T, identifier string)
}

// azureDNSCA is an ACME CA answering DNS-01 in an Azure DNS zone named zoneName.
func azureDNSCA(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, *azure.DNSControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.AzureDNSClientSecretAppConnection)
	subscription := fixture.AzureSubscriptionID(conn.Nonce())
	dns := azure.OpenDNS(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce()))
	dns.Seed(t, azure.WithDNSZone(subscription, "rg-acme", zoneName))
	up := pki.OpenUpstreamCA(t, tn)
	zoneID := azure.DNSZoneID(subscription, "rg-acme", zoneName)
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderAzureDns, zoneID, up.DirectoryURL()), up, dns
}

// powerDNSCA is an ACME CA answering DNS-01 in a PowerDNS zone named zoneName.
func powerDNSCA(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, *powerdns.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.PowerDNSAPIKeyAppConnection)
	dns := powerdns.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	dns.Seed(t, powerdns.WithZone(zoneName))
	up := pki.OpenUpstreamCA(t, tn)
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderPowerdns, zoneName, up.DirectoryURL()), up, dns
}

// cloudDNSProject is the GCP project every test's managed zone is in. Zones are
// scoped by the connection's service account, so tests never share one.
const cloudDNSProject = "harness-dns"

// cloudDNSCA is an ACME CA answering DNS-01 in a Google Cloud DNS managed zone for
// zoneName. It returns the zone's resource name with the fake.
func cloudDNSCA(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, *oauth.GCPControlPlane, string) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.GCPServiceAccountAppConnection(tn))
	gcp := oauth.OpenGCP(t, conn.FakenetAdmin(t), fixture.GCPServiceAccountEmail(tn, conn.Nonce()))
	zone := "z" + id.Short()
	gcp.CloudDNS.Seed(t, oauth.SeedGCPManagedZone(cloudDNSProject, zone, zoneName))
	up := pki.OpenUpstreamCA(t, tn)
	zoneID := "projects/" + cloudDNSProject + "/managedZones/" + zone
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderGcpCloudDns, zoneID, up.DirectoryURL()), up, gcp, zoneID
}

// ultraDNSCA is an ACME CA answering DNS-01 in an UltraDNS zone named zoneName.
func ultraDNSCA(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, *ultradns.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.UltraDNSUsernamePasswordAppConnection)
	dns := ultradns.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	dns.Seed(t, ultradns.WithZone(zoneName))
	up := pki.OpenUpstreamCA(t, tn)
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderUltradns, zoneName, up.DirectoryURL()), up, dns
}

func TestAcmeUpstreamDNS_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	providers := []struct {
		name string
		// apex is set for a provider whose challenge record Infisical names relative
		// to the zone, so only the zone apex can be validated (TestAcmeUpstreamDNS_KnownIssues).
		apex  bool
		newCA func(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, challengeRecords)
	}{
		{"Azure DNS", true, func(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, challengeRecords) {
			ca, up, dns := azureDNSCA(t, tn, proj, zoneName)
			match := func(zone, name string) bool { return zone == zoneName && name == "_acme-challenge" }
			return ca, up, challengeRecords{
				created: func(t *testing.T, _ string) {
					dns.ExpectEvent[azure.DNSRecordCreated](t, func(e azure.DNSRecordCreated) bool { return match(e.Zone, e.Name) })
				},
				deleted: func(t *testing.T, _ string) {
					dns.ExpectEvent[azure.DNSRecordDeleted](t, func(e azure.DNSRecordDeleted) bool { return match(e.Zone, e.Name) })
				},
			}
		}},
		{"PowerDNS", false, func(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, challengeRecords) {
			ca, up, dns := powerDNSCA(t, tn, proj, zoneName)
			match := func(e powerdns.RecordDetail, identifier string) bool {
				return e.Zone == zoneName+"." && e.Name == "_acme-challenge."+identifier+"." && e.Type == "TXT"
			}
			return ca, up, challengeRecords{
				created: func(t *testing.T, identifier string) {
					dns.ExpectEvent[powerdns.RecordCreated](t, func(e powerdns.RecordCreated) bool { return match(e.RecordDetail, identifier) })
				},
				deleted: func(t *testing.T, identifier string) {
					dns.ExpectEvent[powerdns.RecordDeleted](t, func(e powerdns.RecordDeleted) bool { return match(e.RecordDetail, identifier) })
				},
			}
		}},
		{"Google Cloud DNS", false, func(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, challengeRecords) {
			ca, up, gcp, zoneID := cloudDNSCA(t, tn, proj, zoneName)
			match := func(e oauth.GCPDNSRecordDetail, identifier string) bool {
				return e.Zone == zoneID && e.Name == "_acme-challenge."+identifier+"." && e.Type == "TXT"
			}
			return ca, up, challengeRecords{
				created: func(t *testing.T, identifier string) {
					gcp.CloudDNS.ExpectEvent[oauth.GCPDNSRecordCreated](t, func(e oauth.GCPDNSRecordCreated) bool { return match(e.GCPDNSRecordDetail, identifier) })
				},
				deleted: func(t *testing.T, identifier string) {
					gcp.CloudDNS.ExpectEvent[oauth.GCPDNSRecordDeleted](t, func(e oauth.GCPDNSRecordDeleted) bool { return match(e.GCPDNSRecordDetail, identifier) })
				},
			}
		}},
		{"UltraDNS", false, func(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, challengeRecords) {
			ca, up, dns := ultraDNSCA(t, tn, proj, zoneName)
			match := func(e ultradns.RecordDetail, identifier string) bool {
				return e.Zone == zoneName+"." && e.Owner == "_acme-challenge."+identifier+"." && e.Type == "TXT"
			}
			return ca, up, challengeRecords{
				created: func(t *testing.T, identifier string) {
					dns.ExpectEvent[ultradns.RecordCreated](t, func(e ultradns.RecordCreated) bool { return match(e.RecordDetail, identifier) })
				},
				deleted: func(t *testing.T, identifier string) {
					dns.ExpectEvent[ultradns.RecordDeleted](t, func(e ultradns.RecordDeleted) bool { return match(e.RecordDetail, identifier) })
				},
			}
		}},
	}
	for _, provider := range providers {
		t.Run("should issue from the upstream CA after answering DNS-01 in "+provider.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := pki.CertManager(t, tn)
			site := siteName{newSite(t, tn)}
			ca, up, records := provider.newCA(t, tn, proj, site.Domain())
			p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
			name := site.Name("www")
			if provider.apex {
				name = site.Domain()
			}
			c, o := readyOrder(t, p, site, name)

			// Action
			cert := issue(t, c, o, newCSR(t, name, name), upstreamIssuance)

			// Assert
			require.Equal(t, []string{name}, cert.DNSNames)
			records.created(t, name)
			records.deleted(t, name)
			issued := up.State(t).Issued
			require.Len(t, issued, 1)
			require.Equal(t, pki.ParseLeaf(t, issued[0].PEM).Raw, cert.Raw)
		})
	}
}

func TestAcmeUpstreamDNS_ProviderError(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should fail the request naming Google Cloud DNS when it refuses the record write", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		zoneName := id.Short() + ".upstream-dns.test"
		ca, up, gcp, zoneID := cloudDNSCA(t, tn, proj, zoneName)
		gcp.CloudDNS.Fail(t, http.MethodPost, "/dns/v1/"+zoneID+"/changes", http.StatusInternalServerError,
			fakenet.Body(oauth.CloudDNSError(http.StatusInternalServerError, "backendError", "Internal error encountered.")))
		o := pki.NewOrderer(t, proj, pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t))), wait.Timeout(upstreamWait))
		name := "www." + zoneName

		// Action
		res := pki.Request(t, o.Operator, o.App, o.Profile, pki.ServerCertificate(name))

		// Assert
		require.NotNilf(t, res.JSON200, "ordering a certificate returned %d: %s", res.StatusCode(), res.Body)
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusFailed, got.JSON200.Status)
		require.NotNil(t, got.JSON200.ErrorMessage)
		require.Equal(t, "Certificate issuance failed: Failed to update Google Cloud DNS TXT record '_acme-challenge."+name+".' in zone '"+path.Base(zoneID)+"': Internal error encountered.", *got.JSON200.ErrorMessage)
		require.Nil(t, got.JSON200.CertificateId)
		require.Empty(t, up.State(t).Issued)
		require.Empty(t, gcp.CloudDNS.State(t).ManagedZones[zoneID].RRSets)
	})
}

func TestAcmeUpstreamDNS_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should name the Azure DNS challenge record after the identifier when it is below the zone apex", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Azure DNS record set names are relative to the zone, so the DNS-01 record for
			www.<zone> is _acme-challenge.www. Infisical always writes _acme-challenge
			(getAcmeChallengeRecord in acme-certificate-authority-fns.ts), which is the record for the
			apex, so a CA that checks DNS never finds the record for any other name.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		site := siteName{newSite(t, tn)}
		ca, _, dns := azureDNSCA(t, tn, proj, site.Domain())
		p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
		c, o := readyOrder(t, p, site, site.Name("www"))

		// Action
		c.Finalize(t, o.Finalize, newCSR(t, "", site.Name("www")))

		// Assert
		created := dns.ExpectEvent[azure.DNSRecordCreated](t, nil, fakenet.Within(upstreamWait))
		require.Equal(t, "_acme-challenge.www", created.Name)
	})
}
