package instance_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/appconnection"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/provider"
)

func TestInstanceAdmin_Config(t *testing.T) {
	h := harness.From(t)

	t.Run("ok/the instance admin can write instance configuration", func(t *testing.T) {
		spec.Why(t, `The reason this package is Isolated at all. Instance configuration is
			global, so proving it is writable has to happen somewhere that owns its own
			instance -- doing it from a Shared package would change the instance every
			other package is using.`)

		res, err := h.InstanceAdmin(t).API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})
		if err != nil {
			t.Fatalf("writing instance config: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("the instance admin was refused instance config: %d: %s", res.StatusCode(), res.Body)
		}
	})

	t.Run("forbidden/an organization admin is not an instance admin", func(t *testing.T) {
		spec.Why(t, `The Shared profile hands every test an organization admin, and this is
			what makes that safe: the server refuses it instance-wide routes. If this ever
			passed, a Shared test could reconfigure the instance under every other package
			in the run.`)

		tn := h.NewTenant(t)

		res, err := tn.Admin.API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})
		if err != nil {
			t.Fatalf("writing instance config as an org admin: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("an organization admin wrote instance configuration")
		}
	})
}

func TestOutboundStubbing_UnderIsolation(t *testing.T) {
	spec.Why(t, `An Isolated package runs its own WireMock, and a host alias belongs to
		the network rather than the container. Before this had its own network, both
		WireMocks claimed api.github.com on one network and Docker DNS round-robined
		between them, so a stub registered here was missed by requests landing on the
		shared one. This is the regression test for that.`)

	tn := harness.From(t).NewTenant(t)
	conn := appconnection.New(t, tn, provider.GitHub)

	if n := conn.Stub(t).Received(t, "GET", "/user"); n != 1 {
		t.Fatalf("the credential check reached this package's stub %d times, want 1", n)
	}
}
