package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
)

func TestOutbound_IsIntercepted(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an outbound call reaches the fake", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The one test the whole design rests on. The connection is created with
			no host, so GitHub's client resolves api.github.com, and the only way that
			request can arrive here is fakenet answering DNS and presenting a certificate
			the instance was told to trust. If it stops passing, no integration test
			anywhere is testing anything real.`)

		conn := appconnection.New(t, h.NewTenant(t), provider.GitHub)
		gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())

		if n := gh.Received(t, "GET", "/user"); n != 1 {
			t.Fatalf("the credential check reached the fake %d times, want 1", n)
		}
	})

	t.Run("cross-tenant/two connections to one service stay separate", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `One fakenet serves every tenant, so isolation is by credential rather
			than by server. Each connection authenticates with its own, and state is held
			under it, which is why no org id has to be threaded anywhere.`)

		a := appconnection.New(t, h.NewTenant(t), provider.GitHub)
		b := appconnection.New(t, h.NewTenant(t), provider.GitHub)

		// Both created a connection, so both made the same call to the same path.
		for name, conn := range map[string]*appconnection.Connection{"a": a, "b": b} {
			gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
			if n := gh.Received(t, "GET", "/user"); n != 1 {
				t.Errorf("connection %s counted %d requests, want only its own 1", name, n)
			}
		}
	})

	t.Run("invalid/what the fake answers is load bearing", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The interception test above proves a request arrived. On its own that
			is not enough: if the application ignored the response, every value a test
			asserts on would be decoration. Changing the answer has to change the outcome.
			The refusal is a fakenet rule registered against the credential before the
			connection exists, which doubles as the failure-injection path.`)

		_, err := appconnection.Try(t, h.NewTenant(t), provider.GitHub,
			appconnection.RejectCredentials(http.StatusUnauthorized))
		if err == nil {
			t.Fatal("the connection was created even though the credential check was refused")
		}
	})

}
