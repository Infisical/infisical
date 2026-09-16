package infra_test

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestRunner_FailedStartupCarriesContainerOutput(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `A container that never becomes ready is torn down before anyone can call
		Logs() on it, so without capture the error is "context deadline exceeded" and nothing
		else. That is the worst failure this harness can produce: a long boot that ends with
		no evidence. Only a deliberately failing container exercises this, so a passing suite
		never covers it.`)

	ctx := t.Context()
	runner := infra.NewRunner(infra.Workspace(), infra.NewLogger())
	if err := runner.Network(ctx, infra.NetworkName); err != nil {
		t.Fatalf("network: %v", err)
	}

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
	if err == nil {
		t.Fatal("expected the container to fail its wait strategy")
	}

	if !strings.Contains(err.Error(), marker) {
		t.Errorf("error does not carry the container's output, so a real failure would be undiagnosable.\ngot: %v", err)
	}
	if !strings.Contains(err.Error(), "full output:") {
		t.Errorf("error does not point at the captured log file.\ngot: %v", err)
	}

	t.Cleanup(func() { _ = os.RemoveAll(infra.LogDir) })
}
