package infra_test

import (
	"context"
	"os"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func requireDocker(t *testing.T) {
	t.Helper()
	if os.Getenv("INFRA_DOCKER_TESTS") == "" {
		t.Skip("set INFRA_DOCKER_TESTS=1 to run container tests")
	}
}

func TestRunner_AdoptOrCreate(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `Adopt-or-create by name is what replaces a manifest file, a content hash and
		a config hash. If a second process creates instead of adopting, every binary in a
		`+"`go test ./...`"+` run pays for its own stack and the whole scheme is pointless.
		Nothing else in the suite exercises this, because a passing test looks identical
		either way.`)

	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

	name := infra.ContainerName(infra.NameParts{
		Scope:  infra.Shared,
		Module: "redis",
		// Not a fingerprint: a marker so this test cannot adopt a real shared Redis
		// that a suite is using, or leave one behind that a suite would adopt.
		Instance: "adopttest",
	})
	spec := infra.ContainerSpec{
		Name:  name,
		Image: "redis:7-alpine",
		Ports: []int{6379},
		Ready: infra.ForExec([]string{"redis-cli", "ping"}),
	}

	first, err := runner.Run(ctx, spec)
	if err != nil {
		t.Fatalf("first run: %v", err)
	}
	t.Cleanup(func() { _ = first.Stop(context.WithoutCancel(ctx)) })

	if first.Adopted {
		t.Fatal("first run reported adopt; a container of this name was left behind by an earlier run")
	}

	second, err := runner.Run(ctx, spec)
	if err != nil {
		t.Fatalf("second run: %v", err)
	}

	if !second.Adopted {
		t.Error("second run created a new container instead of adopting the first")
	}
	if second.ID != first.ID {
		t.Errorf("adopted a different container: %s then %s", first.ID, second.ID)
	}
	if a, b := first.Endpoint(infra.External, 6379), second.Endpoint(infra.External, 6379); a != b {
		t.Errorf("adopted container moved ports: %s then %s", a.HostPort(), b.HostPort())
	}
}

func TestRunner_NameChangeCreatesNewContainer(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `The other half of the same rule. Infisical puts its Docker image ID in the
		container name precisely so that changed code means a different name means a fresh
		container. A stale app container would run your previous code with every test still
		passing, which is the worst outcome available.`)

	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

	base := infra.NameParts{Scope: infra.Shared, Module: "redis", Instance: "fptest"}
	run := func(fingerprint string) infra.Container {
		t.Helper()
		p := base
		p.Fingerprint = fingerprint
		c, err := runner.Run(ctx, infra.ContainerSpec{
			Name:  infra.ContainerName(p),
			Image: "redis:7-alpine",
			Ports: []int{6379},
			Ready: infra.ForExec([]string{"redis-cli", "ping"}),
		})
		if err != nil {
			t.Fatalf("run %s: %v", fingerprint, err)
		}
		t.Cleanup(func() { _ = c.Stop(context.WithoutCancel(ctx)) })
		return c
	}

	if a, b := run("aaaa1111"), run("bbbb2222"); a.ID == b.ID {
		t.Fatal("a different fingerprint adopted the same container")
	}
}
