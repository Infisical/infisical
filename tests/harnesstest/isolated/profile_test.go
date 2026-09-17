package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
)

func TestIsolated_OwnsItsStubbing(t *testing.T) {
	spec.Why(t, `The only thing unique to this profile that the harness itself owns. An
		Isolated package runs its own WireMock, and a host alias belongs to the network
		rather than the container. Before the profile took a network of its own, both
		WireMocks claimed api.github.com on one network and Docker DNS round-robined
		between them, so a stub registered here was missed by requests landing on the
		shared one. This is the regression test for that.`)

	conn := appconnection.New(t, harness.From(t).NewTenant(t), provider.GitHub)

	if n := conn.Stub(t).Received(t, "GET", "/user"); n != 1 {
		t.Fatalf("the credential check reached this package's stub %d times, want 1", n)
	}
}
