// Package clickhouse runs a ClickHouse container for suites that store audit logs there.
package clickhouse

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	Key  = infra.ModuleKey("clickhouse")
	port = 8123

	user     = "infisical"
	password = "infisical"
	database = "infisical"
)

type module struct{ image string }

type Option func(*module)

func WithImage(img string) Option { return func(m *module) { m.image = img } }

// Module pins the version docker-compose.dev.yml runs.
func Module(opts ...Option) infra.Module {
	m := &module{image: "clickhouse/clickhouse-server:25.12.5"}
	for _, o := range opts {
		o(m)
	}
	return m
}

func (m *module) Key() infra.ModuleKey        { return Key }
func (m *module) Requires() []infra.ModuleKey { return nil }
func (m *module) Name() infra.NameParts       { return infra.NameParts{Module: "clickhouse"} }

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	c, err := d.Run(ctx, infra.ContainerSpec{
		Image: m.image,
		Env: map[string]string{
			"CLICKHOUSE_DB":                        database,
			"CLICKHOUSE_USER":                      user,
			"CLICKHOUSE_PASSWORD":                  password,
			"CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT": "1",
		},
		Ports: []int{port},
		// The HTTP port opens before the server accepts queries, so ask it one.
		Ready: infra.ForExec([]string{"clickhouse-client", "--user", user, "--password", password, "--query", "SELECT 1"}),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c}, nil
}

// Handle is a running ClickHouse.
type Handle struct{ c infra.Container }

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, port) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }

// URL is the form CLICKHOUSE_URL takes, in one mode.
func (h *Handle) URL(m infra.Mode) string {
	return fmt.Sprintf("http://%s:%s@%s/%s", user, password, h.Endpoint(m).HostPort(), database)
}

func MustFrom(d infra.Deps) *Handle {
	h, ok := d.Get[*Handle](Key)
	if !ok {
		panic("infra/clickhouse: MustFrom called for a module that was not declared")
	}
	return h
}
