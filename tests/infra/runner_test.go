package infra_test

import (
	"context"
	"os"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
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

	// Setup
	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	require.NoError(t, runner.Network(ctx, infra.NetworkName))

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
	require.NoError(t, err)
	t.Cleanup(func() { _ = first.Stop(context.WithoutCancel(ctx)) })
	require.False(t, first.Adopted, "a container of this name was left behind by an earlier run")

	// Action
	second, err := runner.Run(ctx, spec)

	// Assert
	require.NoError(t, err)
	require.True(t, second.Adopted, "the second run created instead of adopting")
	require.Equal(t, first.ID, second.ID)
	require.Equal(t, first.Endpoint(infra.External, 6379), second.Endpoint(infra.External, 6379))
}

func TestRunner_NameChangeCreatesNewContainer(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `The other half of the same rule. Infisical puts its Docker image ID in the
		container name precisely so that changed code means a different name means a fresh
		container. A stale app container would run your previous code with every test still
		passing, which is the worst outcome available.`)

	// Setup
	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	require.NoError(t, runner.Network(ctx, infra.NetworkName))

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
		require.NoErrorf(t, err, "running %s", fingerprint)
		t.Cleanup(func() { _ = c.Stop(context.WithoutCancel(ctx)) })
		return c
	}

	// Action
	a, b := run("aaaa1111"), run("bbbb2222")

	// Assert
	require.NotEqual(t, a.ID, b.ID, "a different fingerprint adopted the same container")
}
