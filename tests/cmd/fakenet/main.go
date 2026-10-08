// Command fakenet serves the harness's fakes.
//
// Four listeners, and each exists for a different reason:
//
//	25   SMTP, where Infisical delivers mail
//	53   DNS, so every hostname resolves here and nothing reaches the real internet
//	443  the fakes, with a certificate minted per name asked for
//	8080 the control API, on its own port so the application can never reach it
package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/smtp"
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

	srv := fakenet.New(
		github.Service,
		license.Service,
	)

	mail := smtp.New(func(domain string) fakenet.Emitter { return srv.Emitter(smtp.Host, domain) })
	if err := mail.Start(); err != nil {
		log.Fatalf("fakenet: smtp listener: %v", err)
	}

	go func() { log.Fatalf("fakenet: %v", fakenet.ServeDNS(":53", selfIP)) }()

	go func() {
		log.Fatalf("fakenet: admin listener: %v", http.ListenAndServe(":8080", srv.Admin(ca)))
	}()

	ln, err := tls.Listen("tcp", ":443", ca.TLSConfig())
	if err != nil {
		log.Fatalf("fakenet: %v", err)
	}
	log.Printf("fakenet: %s serving %v", selfIP, srv.Hosts())
	log.Fatalf("fakenet: https listener: %v", http.Serve(ln, srv))
}
