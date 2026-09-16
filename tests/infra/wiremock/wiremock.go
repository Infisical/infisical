// Package wiremock runs a WireMock container in browser-proxying mode.
//
// It intercepts at the network boundary rather than inside the process, which is the
// point: a Go reimplementation of the API inherits it unchanged, unlike the in-app
// nock control API the Python BDD suite uses.
package wiremock

import (
	"context"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	Key = infra.Key("wiremock")

	port = 8080

	// CAPath is where the harness places WireMock's CA inside the application
	// container, for NODE_EXTRA_CA_CERTS.
	CAPath = "/wiremock-ca.pem"
)

type module struct {
	image   string
	aliases []string
	flags   []string
}

type Option func(*module)

func WithImage(img string) Option { return func(m *module) { m.image = img } }

// WithHostAliases resolves the given hostnames to WireMock over Docker DNS.
//
// The escape hatch for clients that ignore HTTP_PROXY, which is most cloud SDKs.
// Aliases are fixed at container start, so under a Shared profile this list is
// run-wide; a package needing a private alias has to take its own stack.
func WithHostAliases(hosts ...string) Option {
	return func(m *module) { m.aliases = append(m.aliases, hosts...) }
}

func WithFlags(flags ...string) Option {
	return func(m *module) { m.flags = append(m.flags, flags...) }
}

func Module(opts ...Option) infra.Module {
	m := &module{
		image: "wiremock/wiremock:3.13.1",
		flags: []string{
			"--enable-browser-proxying",
			"--trust-all-proxy-targets",
			// The journal is global and unbounded by default. Every query filters by
			// tenant, and resetRequests must never be called, so the only bound is
			// this cap.
			"--max-request-journal-entries", "20000",
		},
	}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.Key        { return Key }
func (m *module) Requires() []infra.Key { return nil }
func (m *module) Optional() []infra.Key { return nil }
func (m *module) Name() infra.NameParts { return infra.NameParts{Module: "wiremock"} }

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	c, err := d.Run(ctx, infra.ContainerSpec{
		Image:   m.image,
		Command: m.flags,
		Ports:   []int{port},
		Aliases: m.aliases,
		Ready:   infra.ForHTTP("/__admin/mappings").WithPort("8080/tcp"),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c}, nil
}

// Handle is a running WireMock.
type Handle struct{ c infra.Container }

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, port) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }

// AdminURL is where stubs are registered and the journal is queried. External: the
// Go test process talks to it.
func (h *Handle) AdminURL(m infra.Mode) string {
	return h.Endpoint(m).URL("http") + "/__admin"
}

// ProxyURL is what the application container gets as HTTP_PROXY. Internal: a
// container talks to it.
func (h *Handle) ProxyURL(m infra.Mode) string {
	return h.Endpoint(m).URL("http")
}

// NoProxy keeps traffic to the harness's own containers off the proxy. Without it,
// Infisical would try to reach Postgres through WireMock.
func NoProxy(hosts ...string) string {
	out := "localhost,127.0.0.1"
	for _, h := range hosts {
		out += "," + h
	}
	return out
}

func From(d infra.Deps) (*Handle, bool) { return d.Get[*Handle](Key) }
