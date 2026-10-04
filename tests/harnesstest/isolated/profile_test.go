package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
	"github.com/stretchr/testify/require"
)

func TestIsolated_ReachesTheSharedFakenet(t *testing.T) {
	spec.Why(t, `An Isolated package owns its Infisical but shares fakenet, which it must
		still reach through the shared resolver address.`)

	// Setup
	tn := harness.From(t).NewTenant(t)

	// Action
	conn := fixture.NewAppConnection(t, tn, provider.GitHub)

	// Assert
	gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	require.Equal(t, 1, gh.Received(t, "GET", "/user"))
}
