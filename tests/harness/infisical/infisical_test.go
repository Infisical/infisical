package infisical_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func requireDocker(t *testing.T) {
	t.Helper()
	if os.Getenv("INFRA_DOCKER_TESTS") == "" {
		t.Skip("set INFRA_DOCKER_TESTS=1 to run container tests")
	}
}

// bootStack brings up the minimum an Infisical container needs.
func bootStack(t *testing.T, opts ...infisical.Option) *infisical.Handle {
	t.Helper()
	ctx := t.Context()
	log := infra.NewLogger()

	root, err := infra.RepoRoot()
	if err != nil {
		t.Fatalf("repo root: %v", err)
	}
	img, err := infisical.ResolveImage(ctx, root, log)
	if err != nil {
		t.Fatalf("image: %v", err)
	}

	mods := []infra.Module{postgres.Module(), redis.Module(), mailpit.Module(),
		infisical.Module(append([]infisical.Option{infisical.WithImage(img)}, opts...)...)}
	scopes := map[infra.Key]infra.Scope{}
	for _, m := range mods {
		scopes[m.Key()] = infra.Shared
	}
	plan, err := infra.Resolve(mods, scopes)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	runner := infra.NewRunner(infra.Workspace(), log)
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

	handles := map[infra.Key]infra.Handle{}
	for _, m := range plan.Modules() {
		name := m.Name()
		name.Scope = infra.Test
		name.ScopeID = "m2boot"

		began := time.Now()
		h, err := m.Start(ctx, infra.NewDeps(handles, infra.NetworkName, infra.Workspace(), name, runner, log))
		if err != nil {
			t.Fatalf("start %s: %v", m.Key(), err)
		}
		handles[m.Key()] = h
		t.Cleanup(func() { _ = h.Stop(context.WithoutCancel(ctx)) })
		log.Decision("ready", infra.ContainerName(name), h.Endpoint(infra.External), time.Since(began), "")
	}
	return handles[infisical.Key].(*infisical.Handle)
}

func TestInfisical_Boot(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `This is the first point where the env contract in the module meets the real
		application. Everything downstream assumes it holds, and a mistake in it surfaces as
		a container that exits during migrations with no obvious cause.`)

	app := bootStack(t)

	t.Run("ok/serves the API once Start returns", func(t *testing.T) {
		if app.BaseURL(infra.External) == "" {
			t.Fatal("no base URL")
		}
	})

	t.Run("ok/the container name carries the image id", func(t *testing.T) {
		if app.Image().ShortID() == "" {
			t.Fatal("image has no id, so a code change would adopt a stale container")
		}
	})
}
