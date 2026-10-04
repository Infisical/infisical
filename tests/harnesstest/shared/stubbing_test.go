package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
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
		conn := fixture.NewAppConnection(t, tn, provider.GitHub)

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
		a := fixture.NewAppConnection(t, tenantA, provider.GitHub)
		b := fixture.NewAppConnection(t, tenantB, provider.GitHub)

		// Assert
		for _, conn := range []*fixture.AppConnection{a, b} {
			gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
			require.Equal(t, 1, gh.Received(t, "GET", "/user"), "a connection counted another's requests")
		}
	})

	t.Run("should refuse the connection when the fake rejects the credential", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Proves the answer matters, not just that a request arrived. Also the
			failure-injection path: a rule registered before the connection exists.`)

		// Setup
		tn := h.NewTenant(t)

		// Action
		_, err := fixture.TryAppConnection(t, tn, provider.GitHub,
			fixture.RejectCredentials(http.StatusUnauthorized))

		// Assert
		require.Error(t, err, "the connection was created despite a refused credential check")
	})
}
