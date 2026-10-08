package postgres_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/stretchr/testify/require"
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
	require.NoError(t, runner.Network(ctx, infra.NetworkName))

	m := postgres.Module(opts...)
	name := m.Name()
	name.Scope = infra.Test
	name.ScopeID = infra.Sanitize(t.Name())

	began := time.Now()
	h, err := m.Start(ctx, infra.NewDeps(nil, infra.NetworkName, infra.Workspace(), name, runner, log))
	require.NoError(t, err)
	pg := h.(*postgres.Handle)
	log.Decision("create", infra.ContainerName(name), pg.Endpoint(infra.External), time.Since(began), "")
	t.Cleanup(func() { _ = pg.Stop(context.WithoutCancel(ctx)) })
	return pg
}

func TestPostgres_Start(t *testing.T) {
	requireDocker(t)
	t.Parallel()

	t.Run("should accept connections on an ephemeral port once Start returns", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()

		// Action
		pg := start(t)

		// Assert
		require.NotContains(t, []int{0, 5432}, pg.Endpoint(infra.External).Port)
	})

	t.Run("should give different internal and external addresses", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()

		// Action
		pg := start(t)

		// Assert
		in, ex := pg.Endpoint(infra.Internal), pg.Endpoint(infra.External)
		require.Equal(t, 5432, in.Port)
		require.NotEqual(t, ex.HostPort(), in.HostPort())
		require.NotContains(t, []string{"127.0.0.1", "localhost"}, in.Host)
	})

	t.Run("should start a separate container when the instance is named", func(t *testing.T) {
		requireDocker(t)
		t.Parallel()

		// Action
		app := start(t)
		target := start(t, postgres.Named("rotation"), postgres.WithDatabase("rotation_target"))

		// Assert
		require.NotEqual(t, app.Endpoint(infra.External).Port, target.Endpoint(infra.External).Port)
		require.Equal(t, "rotation_target", target.Database())
	})
}
