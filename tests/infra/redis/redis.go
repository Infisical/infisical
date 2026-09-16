// Package redis runs a Redis container for the harness.
package redis

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	Key  = infra.Key("redis")
	port = 6379
)

type module struct {
	instance string
	image    string
}

type Option func(*module)

func Named(name string) Option    { return func(m *module) { m.instance = name } }
func WithImage(img string) Option { return func(m *module) { m.image = img } }

func Module(opts ...Option) infra.Module {
	m := &module{image: "redis:7-alpine"}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.Key {
	if m.instance == "" {
		return Key
	}
	return Key + infra.Key(":"+m.instance)
}

func (m *module) Requires() []infra.Key { return nil }
func (m *module) Optional() []infra.Key { return nil }
func (m *module) Name() infra.NameParts {
	return infra.NameParts{Module: "redis", Instance: m.instance}
}

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	c, err := d.Run(ctx, infra.ContainerSpec{
		Image: m.image,
		Ports: []int{port},
		Ready: infra.ExecReady("redis-cli", "ping"),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c}, nil
}

// Handle is a running Redis.
//
// Deliberately never flushed mid-run. It is shared, so a suite that depends on a
// clean Redis is a suite that will break another one.
type Handle struct{ c infra.Container }

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, port) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }

func (h *Handle) URL(m infra.Mode) string {
	return fmt.Sprintf("redis://%s", h.Endpoint(m).HostPort())
}

func From(d infra.Deps) (*Handle, bool) { return d.Get[*Handle](Key) }

func MustFrom(d infra.Deps) *Handle {
	h, ok := From(d)
	if !ok {
		panic("infra/redis: MustFrom called for a module that was not declared")
	}
	return h
}
