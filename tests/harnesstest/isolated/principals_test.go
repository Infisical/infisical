package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestAdminPrincipals_AreSeparate(t *testing.T) {
	spec.Why(t, `The harness hands out two administrators and the whole Shared profile
		rests on them being different things. If a tenant administrator could write
		instance configuration, one test could disable signup or rotate the root key
		under every other package in the run, and the damage would surface somewhere
		else entirely.

		This has been wrong once: while the tenant administrator was the bootstrap root
		wearing an organization claim, the second case below failed.

		Isolated because the first case really does write instance configuration.`)

	h := harness.From(t)

	t.Run("ok/the instance admin can write instance configuration", func(t *testing.T) {
		res, err := h.InstanceAdmin(t).API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})
		if err != nil {
			t.Fatalf("writing instance config: %v", err)
		}
		if res.StatusCode() != http.StatusOK {
			t.Fatalf("the instance admin was refused instance config: %d: %s", res.StatusCode(), res.Body)
		}
	})

	t.Run("forbidden/a tenant admin cannot", func(t *testing.T) {
		tn := h.NewTenant(t)

		res, err := tn.Admin.API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})
		if err != nil {
			t.Fatalf("writing instance config as a tenant admin: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("a tenant administrator wrote instance configuration")
		}
	})
}
