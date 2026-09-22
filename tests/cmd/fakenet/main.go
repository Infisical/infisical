// Command fakenet serves the harness's fakes.
//
// Three listeners, and each exists for a different reason:
//
//	53   DNS, so every hostname resolves here and nothing reaches the real internet
//	443  the fakes, with a certificate minted per name asked for
//	8080 the control API, on its own port so the application can never reach it
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fakes/license"
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

	go func() { log.Fatalf("fakenet: %v", fakenet.ServeDNS(":53", selfIP)) }()

	go func() {
		log.Fatalf("fakenet: admin listener: %v", http.ListenAndServe(":8080", srv.Admin(ca)))
	}()

	ln, err := tlsListen(":443", ca)
	if err != nil {
		log.Fatalf("fakenet: %v", err)
	}
	log.Printf("fakenet: %s serving %v", selfIP, srv.Hosts())
	log.Fatalf("fakenet: https listener: %v", http.Serve(ln, srv))
}
