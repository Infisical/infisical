package integrations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
)

func TestAppConnection_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/an outbound call is intercepted", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The one test the whole stubbing design rests on. The connection is
			created with no host, so GitHub's client resolves api.github.com, and the only
			way that request can reach WireMock is the forward proxy and the injected CA.
			If it stops passing, no integration test below it is testing anything real.`)

		tn := h.NewTenant(t)
		conn := appconnection.New(t, tn, provider.GitHub)

		if n := conn.Stub(t).Received(t, "GET", "/user"); n != 1 {
			t.Fatalf("the credential check reached the stub %d times, want 1", n)
		}
	})

	t.Run("cross-tenant/two connections stubbing one path stay separate", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `One WireMock serves every tenant, so isolation is by discriminator
			rather than by server. Each connection authenticates with its own credential
			and the journal is filtered on it, which is why no org id has to be threaded
			through a stub.`)

		a := appconnection.New(t, h.NewTenant(t), provider.GitHub)
		b := appconnection.New(t, h.NewTenant(t), provider.GitHub)

		// Both created a connection, so both made the same call to the same path.
		for name, conn := range map[string]*appconnection.Connection{"a": a, "b": b} {
			if n := conn.Stub(t).Received(t, "GET", "/user"); n != 1 {
				t.Errorf("connection %s counted %d requests, want only its own 1", name, n)
			}
		}
	})

	t.Run("invalid/a rejected credential fails the create", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Proves the stub is load bearing rather than incidental: if creating a
			connection succeeded whatever the provider answered, the interception above
			would not be evidence of anything.`)

		tn := h.NewTenant(t)

		_, err := appconnection.Try(t, tn, provider.GitHub, appconnection.RejectCredentials(http.StatusUnauthorized))
		if err == nil {
			t.Fatal("a connection was created against a provider that rejected the credential")
		}
	})
}
