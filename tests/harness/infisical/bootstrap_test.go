package infisical_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
)

func TestBootstrap(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `Bootstrap is the root of every principal the suite has. If it is wrong,
		nothing downstream can authenticate, and the failure surfaces as an unexplained 401
		in whichever test happens to run first.`)

	app := bootStack(t)
	root, err := infisical.Bootstrap(t.Context(), app.BaseURL(infra.External))
	if err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	t.Run("ok/yields an instance admin identity token", func(t *testing.T) {
		if root.IdentityToken == "" {
			t.Fatal("no identity token; instance-level suites have no principal")
		}
		if root.IdentityID == uuid.Nil {
			t.Error("identity has no id")
		}
	})

	t.Run("ok/keeps the root user credentials", func(t *testing.T) {
		spec.Why(t, `POST /api/v2/organizations refuses any actor that is not a USER, so the
			identity token cannot mint tenants and the password is the only thing that can.`)

		if root.Email == "" || root.Password == "" {
			t.Fatal("no root user credentials; NewTenant cannot create an organization")
		}
	})

	t.Run("ok/signup is re-enabled", func(t *testing.T) {
		spec.Why(t, `bootstrapInstance sets allowSignUp:false on any non-cloud instance.
			Left off, there is no path to a second real user, which is the only way to get a
			non-administrator principal.`)

		st, err := app.Status(t.Context())
		if err != nil {
			t.Fatalf("status: %v", err)
		}
		if !st.SignupAllowed {
			t.Error("allowSignUp is still false")
		}
	})

	t.Run("idempotent/bootstrapping an adopted instance logs in instead of failing", func(t *testing.T) {
		spec.Why(t, `admin/bootstrap is one shot per database, but a container is adopted by
			name, so the second test binary to arrive finds an instance already bootstrapped.
			That has to be recoverable or only the first binary in a run can work.`)

		again, err := infisical.Bootstrap(t.Context(), app.BaseURL(infra.External))
		if err != nil {
			t.Fatalf("second bootstrap: %v", err)
		}
		if again.Email != root.Email {
			t.Errorf("adopted a different root: %q then %q", root.Email, again.Email)
		}
	})
}
