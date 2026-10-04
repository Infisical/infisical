package infra_test

import (
	"os"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestRunner_FailedStartupCarriesContainerOutput(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `A container that never becomes ready is torn down before anyone can call
		Logs() on it, so without capture the error is "context deadline exceeded" and nothing
		else. That is the worst failure this harness can produce: a long boot that ends with
		no evidence. Only a deliberately failing container exercises this, so a passing suite
		never covers it.`)

	// Setup
	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	require.NoError(t, runner.Network(ctx, infra.NetworkName))
	t.Cleanup(func() { _ = os.RemoveAll(infra.LogDir) })

	// Action
	const marker = "harness-log-capture-marker"
	_, err := runner.Run(ctx, infra.ContainerSpec{
		Name:    infra.ContainerName(infra.NameParts{Scope: infra.Test, ScopeID: "logcap", Module: "alpine"}),
		Image:   "alpine:3.20",
		Command: []string{"sh", "-c", "echo " + marker + "; sleep 120"},
		Ports:   []int{9999},
		// Nothing listens on 9999, so this can only time out.
		Ready:          infra.ForListeningPort("9999/tcp"),
		StartupTimeout: 8 * time.Second,
	})

	// Assert
	require.Error(t, err, "the container should fail its wait strategy")
	require.Contains(t, err.Error(), marker, "the error does not carry the container's output")
	require.Contains(t, err.Error(), "full output:", "the error does not point at the captured log")
}
