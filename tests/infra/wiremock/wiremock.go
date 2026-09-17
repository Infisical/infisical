// Package wiremock runs a WireMock container in browser-proxying mode.
//
// It intercepts at the network boundary rather than inside the process, which is the
// point: a Go reimplementation of the API inherits it unchanged, unlike the in-app
// nock control API the Python BDD suite uses.
package wiremock

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"

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

	h := &Handle{c: c}

	// Here rather than in the caller, so nothing can slip out before it. WireMock
	// starts before anything that would make an outbound call, and a container that
	// boots against an unguarded proxy reaches the real internet in the meantime --
	// which is what happened while this lived in harness.bringUp.
	if err := h.NewAdminClient().DenyUnstubbed(ctx); err != nil {
		return nil, err
	}
	return h, nil
}

// Handle is a running WireMock.
type Handle struct {
	c infra.Container

	caOnce sync.Once
	caPath string
	caErr  error
}

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

// CAFile writes WireMock's CA to a host file and returns the path.
//
// Browser proxying terminates TLS with a certificate this CA signs, so without it in
// the application's trust store every HTTPS call through the proxy fails
// verification. Only HTTP would work, and every real provider is HTTPS.
//
// Fetched from the live container rather than generated, because WireMock mints its
// CA at startup: an adopted container has the CA of whoever created it.
func (h *Handle) CAFile(ctx context.Context) (string, error) {
	h.caOnce.Do(func() { h.caPath, h.caErr = h.fetchCA(ctx) })
	return h.caPath, h.caErr
}

func (h *Handle) fetchCA(ctx context.Context) (string, error) {
	url := h.AdminURL(infra.External) + "/certs/wiremock-ca.crt"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("wiremock: fetching the CA: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("wiremock: fetching the CA returned %d", res.StatusCode)
	}
	pem, err := io.ReadAll(res.Body)
	if err != nil {
		return "", fmt.Errorf("wiremock: reading the CA: %w", err)
	}

	f, err := os.CreateTemp("", "wiremock-ca-*.pem")
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.Write(pem); err != nil {
		return "", err
	}
	return f.Name(), nil
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
