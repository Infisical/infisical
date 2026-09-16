// Package postgres runs a Postgres container for the harness.
package postgres

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/tests/infra"
)

const (
	// Key is the default instance. A Named() instance qualifies it, so
	// postgres.Module(postgres.Named("rotation")) is "postgres:rotation" and cannot
	// collide with the app's own database.
	Key = infra.Key("postgres")

	port     = 5432
	user     = "infisical"
	password = "infisical"
)

type module struct {
	instance string
	image    string
	database string
	command  []string
}

type Option func(*module)

// Named runs a second, independent Postgres. The rotation suites need a target
// database separate from the application's own.
func Named(name string) Option { return func(m *module) { m.instance = name } }

func WithDatabase(db string) Option { return func(m *module) { m.database = db } }
func WithImage(img string) Option   { return func(m *module) { m.image = img } }

func Module(opts ...Option) infra.Module {
	m := &module{
		image:    "postgres:14-alpine",
		database: "infisical_test",
		// max_locks_per_transaction matches the dev stack. The application holds
		// enough locks in one transaction to need it.
		command: []string{"postgres", "-c", "max_locks_per_transaction=512"},
	}
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
	return infra.NameParts{Module: "postgres", Instance: m.instance}
}

func (m *module) Start(ctx context.Context, d infra.Deps) (infra.Handle, error) {
	c, err := d.Run(ctx, infra.ContainerSpec{
		Image:   m.image,
		Command: m.command,
		Env: map[string]string{
			"POSTGRES_USER":     user,
			"POSTGRES_PASSWORD": password,
			"POSTGRES_DB":       m.database,
		},
		Ports: []int{port},
		// A running Postgres container is not an accepting one, which is why this is
		// pg_isready rather than a port check.
		Ready: infra.ForExec([]string{"pg_isready", "-U", user, "-d", m.database}),
	})
	if err != nil {
		return nil, err
	}
	return &Handle{c: c, database: m.database}, nil
}

// Handle is a running Postgres.
type Handle struct {
	c        infra.Container
	database string
}

func (h *Handle) Endpoint(m infra.Mode) infra.Endpoint { return h.c.Endpoint(m, port) }
func (h *Handle) Stop(ctx context.Context) error       { return h.c.Stop(ctx) }
func (h *Handle) Database() string                     { return h.database }

// DSN is the connection string in one mode. Internal for another container,
// External for the Go test process. Saying which is not optional.
func (h *Handle) DSN(m infra.Mode) string {
	e := h.Endpoint(m)
	return fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=disable", user, password, e.HostPort(), h.database)
}

// From is for other MODULES during Start: an optional dependency.
func From(d infra.Deps, instance ...string) (*Handle, bool) {
	return d.Get[*Handle](key(instance...))
}

// MustFrom is for a required dependency. Unreachable when Resolve has run, since it
// rejects a missing requirement before any container starts.
func MustFrom(d infra.Deps, instance ...string) *Handle {
	h, ok := From(d, instance...)
	if !ok {
		panic("infra/postgres: MustFrom called for a module that was not declared")
	}
	return h
}

func key(instance ...string) infra.Key {
	if len(instance) == 0 || instance[0] == "" {
		return Key
	}
	return Key + infra.Key(":"+instance[0])
}
