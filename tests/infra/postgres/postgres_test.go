package postgres_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/internal/spec"
)

// These need Docker. Skipped when INFRA_DOCKER_TESTS is unset so `make test-unit`
// stays under a second.
func requireDocker(t *testing.T) {
	t.Helper()
	if os.Getenv("INFRA_DOCKER_TESTS") == "" {
		t.Skip("set INFRA_DOCKER_TESTS=1 to run container tests")
	}
}

func start(t *testing.T, opts ...postgres.Option) *postgres.Handle {
	t.Helper()
	ctx := t.Context()
	log := infra.NewLogger()
	runner := infra.NewRunner(infra.Workspace(), log)
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

	m := postgres.Module(opts...)
	name := m.Name()
	name.Scope = infra.Test
	name.ScopeID = infra.Sanitize(t.Name())

	began := time.Now()
	h, err := m.Start(ctx, infra.NewDeps(nil, infra.NetworkName, infra.Workspace(), name, runner))
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	pg := h.(*postgres.Handle)
	log.Decision("create", infra.ContainerName(name), pg.Endpoint(infra.External), time.Since(began), "")
	t.Cleanup(func() { _ = pg.Stop(context.WithoutCancel(ctx)) })
	return pg
}

func TestPostgres_Start(t *testing.T) {
	requireDocker(t)
	t.Parallel()

	t.Run("ok/is accepting connections once Start returns", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()
		spec.Why(t, `The container being "running" is not the same as Postgres accepting
			connections, which is why readiness is pg_isready rather than a port check.`)

		pg := start(t)
		if got := pg.Endpoint(infra.External).Port; got == 0 || got == 5432 {
			t.Fatalf("external port should be an ephemeral mapping, got %d", got)
		}
	})

	t.Run("ok/internal and external addresses differ", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()
		spec.Why(t, `Handing an Internal address to the test process, or an External one to
			another container, is the most common way to misuse a container harness. The two
			must be distinguishable at every call site.`)

		pg := start(t)
		in, ex := pg.Endpoint(infra.Internal), pg.Endpoint(infra.External)
		if in.Port != 5432 {
			t.Errorf("internal port = %d, want the container port 5432", in.Port)
		}
		if in.HostPort() == ex.HostPort() {
			t.Errorf("internal and external addresses are identical: %s", in.HostPort())
		}
		if in.Host == "127.0.0.1" || in.Host == "localhost" {
			t.Errorf("internal host should be the network alias, got %q", in.Host)
		}
	})

	t.Run("ok/a Named instance is a separate container", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()
		spec.Why(t, `The rotation suites rotate credentials against a target database that
			must not be the application's own.`)

		app := start(t)
		target := start(t, postgres.Named("rotation"), postgres.WithDatabase("rotation_target"))

		if app.Endpoint(infra.External).Port == target.Endpoint(infra.External).Port {
			t.Fatal("Named() instance shares a container with the default")
		}
		if target.Database() != "rotation_target" {
			t.Fatalf("database = %q, want rotation_target", target.Database())
		}
	})
}
