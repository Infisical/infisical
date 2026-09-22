package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/project"
	"github.com/Infisical/infisical/tests/fixture/secret"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/a created secret reads back with its value", func(t *testing.T) {
		t.Parallel()

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		created := secret.Create(t, proj, "dev", "DB_URL", "postgres://localhost/app")
		if created.Version != 1 {
			t.Errorf("a new secret is at version %v, want 1", created.Version)
		}

		got := secret.Get(t, proj, "dev", "DB_URL")
		if got.Value != "postgres://localhost/app" {
			t.Errorf("secret read back as %q, want postgres://localhost/app", got.Value)
		}
		if got.ValueHidden {
			t.Error("the value came back hidden, so nothing downstream could use it")
		}
		if got.Path != "/" {
			t.Errorf("secret is at path %q, want /", got.Path)
		}
	})

	t.Run("ok/the same name in two environments holds two values", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Environments are the point of a secret manager: the same key carries a
			different value per environment, and a create in one must not touch another.`)

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		secret.Create(t, proj, "dev", "API_KEY", "dev-value")
		secret.Create(t, proj, "prod", "API_KEY", "prod-value")

		if got := secret.Get(t, proj, "dev", "API_KEY"); got.Value != "dev-value" {
			t.Errorf("dev holds %q, want dev-value", got.Value)
		}
		if got := secret.Get(t, proj, "prod", "API_KEY"); got.Value != "prod-value" {
			t.Errorf("prod holds %q, want prod-value", got.Value)
		}
	})

	t.Run("conflict/creating the same name twice is refused", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Create must not silently overwrite. If it did, a caller expecting to
			add a secret could replace one already in use and never learn about it.`)

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		secret.Create(t, proj, "dev", "TOKEN", "first")

		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "TOKEN",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "dev",
				SecretPath:  new("/"),
				SecretValue: "second",
			})
		if err != nil {
			t.Fatalf("creating a duplicate secret: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("creating a secret that already exists was allowed")
		}
		if got := secret.Get(t, proj, "dev", "TOKEN"); got.Value != "first" {
			t.Errorf("the refused create still changed the value to %q", got.Value)
		}
	})

	t.Run("invalid/an unknown environment is refused", func(t *testing.T) {
		t.Parallel()

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "STRAY",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "nope",
				SecretPath:  new("/"),
				SecretValue: "value",
			})
		if err != nil {
			t.Fatalf("creating a secret in an unknown environment: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatal("a secret was created in an environment that does not exist")
		}
	})

	t.Run("cross-tenant/another tenant's project is not writable", func(t *testing.T) {
		t.Parallel()

		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		target := project.New(t, theirs, project.WithType("secret-manager"))

		res, err := mine.Admin.API.CreateSecretV4WithResponse(t.Context(), "STOLEN",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   target.ID,
				Environment: "dev",
				SecretPath:  new("/"),
				SecretValue: "value",
			})
		if err != nil {
			t.Fatalf("writing into another tenant's project: %v", err)
		}
		if res.StatusCode() == http.StatusOK {
			t.Fatalf("tenant %s wrote a secret into tenant %s's project", mine.OrgSlug, theirs.OrgSlug)
		}
	})
}
