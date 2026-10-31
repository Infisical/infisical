package harness

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
)

// TestContainer is a container one test started, such as a relay or gateway agent.
// It is stopped when the test ends.
type TestContainer struct {
	// Name is its address on the shared network, for Infisical and sibling
	// containers to dial: the spec's Alias when one was given.
	Name string

	c infra.Container
}

// Stop stops the container before the test ends, for a test whose claim is what
// happens when it goes away.
func (c *TestContainer) Stop(t *testing.T) {
	t.Helper()
	if err := c.c.Stop(context.WithoutCancel(t.Context())); err != nil {
		t.Fatalf("harness: stopping %s: %v", c.Name, err)
	}
}

// Logs is the container's output so far.
func (c *TestContainer) Logs(t *testing.T) string {
	t.Helper()
	out, err := c.c.Logs(context.WithoutCancel(t.Context()))
	if err != nil {
		return "harness: reading logs of " + c.Name + ": " + err.Error()
	}
	return out
}

// RunContainer starts a container for one test, on the network Infisical is on and
// resolving through fakenet as Infisical does, and stops it at cleanup. module names
// it; the spec's Name, Network and Labels are filled in here.
//
// Set Alias when the address has to be known before the container starts, such as a
// relay whose host Infisical records before the agent can enroll. It must be unique.
//
// Its output is logged when the test fails, since an agent that never connected is
// usually explained only there.
func (s *Stack) RunContainer(t *testing.T, module string, spec infra.ContainerSpec) *TestContainer {
	t.Helper()

	parts := infra.NameParts{Scope: infra.Test, ScopeID: id.Short() + id.Short(), Module: module}
	spec.Name = infra.ContainerName(parts)
	if spec.Alias == "" {
		spec.Alias = spec.Name
	}
	spec.Network = infra.NetworkName
	spec.Labels = infra.Labels(parts, infra.Workspace())
	if len(spec.DNS) == 0 {
		spec.DNS = []string{fakenet.IP}
	}

	runner := infra.NewRunner(infra.Workspace(), s.log)
	c, err := runner.Run(t.Context(), spec)
	if err != nil {
		t.Fatalf("harness: starting %s: %v", spec.Name, err)
	}
	tc := &TestContainer{Name: spec.Alias, c: c}

	t.Cleanup(func() {
		if t.Failed() {
			t.Logf("harness: output of %s:\n%s", tc.Name, tc.Logs(t))
		}
		// A container the test already stopped answers with an error here, which is
		// the outcome wanted anyway.
		_ = c.Stop(context.WithoutCancel(context.Background()))
	})
	return tc
}
