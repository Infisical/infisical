// Package mailpit runs a Mailpit container: a fake SMTP server with a search API.
//
// Chosen over the dev stack's MailHog for the search API and per-message delete,
// both of which a parallel suite needs. Isolation between tenants is by address
// (alice@<orgslug>.test), not by running more than one server.
package mailpit

import (
	"context"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	Key = infra.Key("mailpit")

	smtpPort = 1025
	apiPort  = 8025
)

type module struct{ image string }

type Option func(*module)

func WithImage(img string) Option { return func(m *module) { m.image = img } }

func Module(opts ...Option) infra.Module {
	m := &module{image: "axllent/mailpit:latest"}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.Key        { return Key }
func (m *module) Requires() []infra.Key { return nil }
func (m *module) Optional() []infra.Key { return nil }
func (m *module) Name() infra.NameParts { return infra.NameParts{Module: "mailpit"} }

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	c, err := d.Run(ctx, infra.ContainerSpec{
		Image: m.image,
		Ports: []int{smtpPort, apiPort},
		Ready: infra.HTTPReady(apiPort, "/api/v1/info"),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c}, nil
}

// Handle is a running Mailpit.
type Handle struct{ c infra.Container }

// Endpoint is the SMTP endpoint, which is what a container needs. The test process
// wants API instead.
func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, smtpPort) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }

// API is the HTTP endpoint the harness reads messages from. Almost always External:
// the Go test process polls it, not a container.
func (h *Handle) API(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, apiPort) }

func From(d infra.Deps) (*Handle, bool) { return d.Get[*Handle](Key) }
