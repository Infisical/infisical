package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestOutbound_IsIntercepted(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should reach the fake when the product calls a hardcoded host", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The design rests on this: with no host configured, the only way the
			call arrives is fakenet answering DNS with a certificate the instance trusts.`)

		// Setup
		tn := h.NewTenant(t)

		// Action
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)

		// Assert
		gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		require.Equal(t, 1, gh.Received(t, "GET", "/user"))
	})

	t.Run("should keep connections apart when two use the same service", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `One fakenet serves every tenant, so isolation is by credential.`)

		// Setup
		tenantA, tenantB := h.NewTenant(t), h.NewTenant(t)

		// Action
		a := fixture.NewAppConnection(t, tenantA, fixture.GitHubPATAppConnection)
		b := fixture.NewAppConnection(t, tenantB, fixture.GitHubPATAppConnection)

		// Assert
		for _, conn := range []*fixture.AppConnection{a, b} {
			gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
			require.Equal(t, 1, gh.Received(t, "GET", "/user"), "a connection counted another's requests")
		}
	})
}
