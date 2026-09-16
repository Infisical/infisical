package infra_test

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/infra/redis"
	"github.com/Infisical/infisical/tests/infra/wiremock"
	"github.com/Infisical/infisical/tests/internal/spec"
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
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	log := infra.NewLogger()
	runner := infra.NewRunner(infra.Workspace(), log)
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

	handles := map[infra.Key]infra.Handle{}
	for _, m := range plan.Modules() {
		name := m.Name()
		name.Scope = infra.Test
		name.ScopeID = "m1smoke"

		h, err := m.Start(ctx, infra.NewDeps(handles, infra.NetworkName, infra.Workspace(), name, runner, log))
		if err != nil {
			t.Fatalf("start %s: %v", m.Key(), err)
		}
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
		mailpit.Module(),
		wiremock.Module(),
	}, infra.Shared)

	t.Run("ok/every module reports a usable external address", func(t *testing.T) {
		for key, h := range handles {
			if e := h.Endpoint(infra.External); e.Host == "" || e.Port == 0 {
				t.Errorf("%s external endpoint is unusable: %+v", key, e)
			}
		}
	})

	t.Run("ok/internal addresses are container aliases, not host addresses", func(t *testing.T) {
		for key, h := range handles {
			in := h.Endpoint(infra.Internal)
			if in.Host == "localhost" || in.Host == "127.0.0.1" {
				t.Errorf("%s internal host is a host address: %s", key, in.Host)
			}
		}
	})

	t.Run("ok/mailpit exposes SMTP and its API on different ports", func(t *testing.T) {
		mp := handles[mailpit.Key].(*mailpit.Handle)
		if smtp, api := mp.Endpoint(infra.Internal).Port, mp.API(infra.Internal).Port; smtp == api {
			t.Fatalf("SMTP and API share port %d; the application dials one and the harness reads the other", smtp)
		}
	})

	t.Run("ok/wiremock serves its admin API", func(t *testing.T) {
		wm := handles[wiremock.Key].(*wiremock.Handle)
		if got := wm.AdminURL(infra.External); got == "" {
			t.Fatal("no admin URL")
		}
	})
}
