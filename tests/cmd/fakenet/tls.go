package main

import (
	"crypto/tls"
	"net"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

func tlsListen(addr string, ca *fakenet.CA) (net.Listener, error) {
	return tls.Listen("tcp", addr, ca.TLSConfig())
}
