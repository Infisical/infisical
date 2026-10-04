package infra_test

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// startAll resolves and starts a module set the way the harness will, so this
// exercises the graph, the runner and every module together rather than one at a
// time.
func startAll(t *testing.T, mods []infra.Module, scope infra.Scope) map[infra.Key]infra.Handle {
	t.Helper()
	ctx := t.Context()

	scopes := make(map[infra.Key]infra.Scope, len(mods))
	for _, m := range mods {
		scopes[m.Key()] = scope
	}
	plan, err := infra.Resolve(mods, scopes)
	require.NoError(t, err)

	log := infra.NewLogger()
	runner := infra.NewRunner(infra.Workspace(), log)
	require.NoError(t, runner.Network(ctx, infra.NetworkName))

	handles := map[infra.Key]infra.Handle{}
	for _, m := range plan.Modules() {
		name := m.Name()
		name.Scope = infra.Test
		name.ScopeID = "m1smoke"

		h, err := m.Start(ctx, infra.NewDeps(handles, infra.NetworkName, infra.Workspace(), name, runner, log))
		require.NoErrorf(t, err, "starting %s", m.Key())
		handles[m.Key()] = h
		t.Cleanup(func() { _ = h.Stop(context.WithoutCancel(ctx)) })
		log.Decision("ready", infra.ContainerName(name), h.Endpoint(infra.External), 0, "")
	}
	return handles
}

func TestStack_AllModulesComeUpTogether(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `Every module passes on its own. What this proves is that they come up
		through the real graph on one shared network, which is the only arrangement the
		harness ever actually uses.`)

	handles := startAll(t, []infra.Module{
		postgres.Module(),
		redis.Module(),
	}, infra.Shared)

	t.Run("should report a usable external address for every module", func(t *testing.T) {
		for key, h := range handles {
			e := h.Endpoint(infra.External)
			require.NotEmptyf(t, e.Host, "%s has no external host", key)
			require.NotZerof(t, e.Port, "%s has no external port", key)
		}
	})

	t.Run("should use container aliases rather than host addresses internally", func(t *testing.T) {
		for key, h := range handles {
			require.NotContainsf(t, []string{"localhost", "127.0.0.1"}, h.Endpoint(infra.Internal).Host,
				"%s internal host is a host address", key)
		}
	})
}
