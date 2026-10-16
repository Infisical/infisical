package infra

import (
	"fmt"
	"net"
	"strconv"
)

// Mode selects which address of a container you get back.
//
// Handing an Internal address to the test process, or an External one to another
// container, is the most common way to misuse a container harness. There is
// deliberately no bare URL() accessor, so every call site has to say which it means.
type Mode int

const (
	// Internal is the network alias plus the container port. Use it when one
	// container needs to reach another, for example Infisical dialling Postgres.
	Internal Mode = iota

	// External is the host plus the ephemeral mapped port. Use it when the Go test
	// process needs to reach a container.
	External
)

func (m Mode) String() string {
	if m == Internal {
		return "internal"
	}
	return "external"
}

// Endpoint is a reachable host and port in one mode.
type Endpoint struct {
	Host string
	Port int
}

func (e Endpoint) HostPort() string {
	return net.JoinHostPort(e.Host, strconv.Itoa(e.Port))
}

func (e Endpoint) URL(scheme string) string {
	return fmt.Sprintf("%s://%s", scheme, e.HostPort())
}
