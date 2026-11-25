// Command fakenet serves the harness's fakes.
//
// The listeners, and each exists for a different reason:
//
//	22   SSH, the Linux host a Linux Server certificate sync writes to
//	25   SMTP, where Infisical delivers mail
//	53   DNS, so every hostname resolves here and nothing reaches the real internet
//	80   the fakes over plain HTTP, for a protocol that never uses TLS: ACME HTTP-01
//	443  the fakes, with a certificate minted per name asked for
//	8080 the control API, on its own port so the application can never reach it
//	8444 a TCP port that accepts and never answers, so a client waits out its timeout
package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/Infisical/infisical/tests/fakes/alicloud"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fakes/dnsmadeeasy"
	"github.com/Infisical/infisical/tests/fakes/f5bigip"
	"github.com/Infisical/infisical/tests/fakes/gcp"
	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/Infisical/infisical/tests/fakes/kemp"
	"github.com/Infisical/infisical/tests/fakes/kubernetes"
	"github.com/Infisical/infisical/tests/fakes/ldap"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/linuxserver"
	"github.com/Infisical/infisical/tests/fakes/netscaler"
	"github.com/Infisical/infisical/tests/fakes/nutanix"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fakes/oci"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fakes/panos"
	"github.com/Infisical/infisical/tests/fakes/pwnedpasswords"
	"github.com/Infisical/infisical/tests/fakes/servicenow"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fakes/venaficloud"
	"github.com/Infisical/infisical/tests/fakes/venafitpp"
	"github.com/Infisical/infisical/tests/fakes/vercel"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fakes/website"
	"github.com/Infisical/infisical/tests/infra/fakenet"
)

func main() {
	selfIP := os.Getenv("FAKENET_IP")
	if selfIP == "" {
		log.Fatal("fakenet: FAKENET_IP is unset, so the DNS server has no address to answer with")
	}

	ca, err := fakenet.LoadOrCreateCA(fakenet.CAPath)
	if err != nil {
		log.Fatalf("fakenet: %v", err)
	}

	services := []fakenet.Service{
		github.Service,
		license.Service,
		servicenow.Service,
		oidcidp.Service,
		webhook.Service,
		webhook.Slack,
		webhook.Splunk,
		vercel.Service,
		oauth.Google, oauth.GitHub, oauth.GitLab, oauth.GCPCertificateManager,
		gcp.STS, gcpIAMCredentials{},
		kubernetes.Service, azure.Service, azure.KeyVault, alicloud.Service, oci.Service,
		ldap.Service, linuxserver.Service,
		acmeca.Service, cloudflare.Service, dnsmadeeasy.Service, website.Service,
		f5bigip.Service, kemp.Service, netscaler.Service, nutanix.Service, panos.Service,
		digicert.Service, godaddy.Service, venafitpp.Service, venaficloud.Service, azureadcs.Service,
		chef.Service,
		imperva.Provisioning, imperva.REST,
		pwnedpasswords.Service,
	}
	srv := fakenet.New(append(services, aws.Services...)...)

	go func() { log.Fatalf("fakenet: ldap listener: %v", ldap.Serve(fmt.Sprintf(":%d", ldap.Port), srv)) }()

	go func() {
		log.Fatalf("fakenet: ssh listener: %v", linuxserver.Serve(fmt.Sprintf(":%d", linuxserver.Port), func(user string) (*linuxserver.Server, bool) {
			fake, ok := srv.Lookup(linuxserver.Service.Host(), user)
			if !ok {
				return nil, false
			}
			host, ok := fake.(*linuxserver.Server)
			return host, ok
		}))
	}()

	mail := smtp.New(func(domain string) fakenet.Emitter { return srv.Emitter(smtp.Host, domain) })
	if err := mail.Start(); err != nil {
		log.Fatalf("fakenet: smtp listener: %v", err)
	}

	go func() {
		log.Fatalf("fakenet: stall listener: %v", fakenet.ServeStall(fmt.Sprintf(":%d", fakenet.StallPort)))
	}()

	go func() { log.Fatalf("fakenet: %v", srv.ServeDNS(":53", selfIP)) }()

	go func() {
		log.Fatalf("fakenet: admin listener: %v", http.ListenAndServe(":8080", srv.Admin(ca)))
	}()

	go func() { log.Fatalf("fakenet: http listener: %v", http.ListenAndServe(":80", srv)) }()

	ln, err := tls.Listen("tcp", ":443", ca.TLSConfig())
	if err != nil {
		log.Fatalf("fakenet: %v", err)
	}
	log.Printf("fakenet: %s serving %v", selfIP, srv.Hosts())
	log.Fatalf("fakenet: https listener: %v", http.Serve(ln, srv))
}

// gcpIAMCredentials serves iamcredentials.googleapis.com for both of its callers,
// since fakenet keeps one service per host. A token the instance's own service account
// redeemed impersonates an account (oauth, scoped by its email); a token STS issued
// for a workload identity pool impersonates through federation (gcp, scoped by pool).
type gcpIAMCredentials struct{}

func (gcpIAMCredentials) Host() string { return gcp.IAMCredentials.Host() }

func (gcpIAMCredentials) Scope(r *http.Request) (string, bool) {
	if key, ok := oauth.GCPIAMCredentials.Scope(r); ok {
		return key, true
	}
	return gcp.IAMCredentials.Scope(r)
}

// New picks the fake by scope key: pool ids cannot contain a dot, so only the oauth
// side's keys are service account emails.
func (gcpIAMCredentials) New(events fakenet.Emitter) fakenet.Fake {
	if strings.HasSuffix(events.Scope(), ".iam.gserviceaccount.com") {
		return oauth.GCPIAMCredentials.New(events)
	}
	return gcp.IAMCredentials.New(events)
}
