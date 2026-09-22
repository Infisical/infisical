package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/provider"
)

func TestIsolated_ReachesTheSharedFakenet(t *testing.T) {

	conn := appconnection.New(t, harness.From(t).NewTenant(t), provider.GitHub)
	gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())

	if n := gh.Received(t, "GET", "/user"); n != 1 {
		t.Fatalf("the credential check reached fakenet %d times, want 1", n)
	}
}
