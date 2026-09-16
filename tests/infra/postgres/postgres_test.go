package postgres_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
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
	h, err := m.Start(ctx, infra.NewDeps(nil, infra.NetworkName, infra.Workspace(), name, runner, log))
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

	t.Run("ok/accepts connections by the time Start returns, not merely running", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()
		pg := start(t)
		if got := pg.Endpoint(infra.External).Port; got == 0 || got == 5432 {
			t.Fatalf("external port should be an ephemeral mapping, got %d", got)
		}
	})

	t.Run("ok/internal and external addresses differ", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()
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
