package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/project"
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

		created := createSecret(t, tn, proj.ID, "dev", "/", "DB_URL", "postgres://localhost/app")
		if created.Secret.SecretKey != "DB_URL" {
			t.Errorf("created secret is named %q, want DB_URL", created.Secret.SecretKey)
		}

		got := getSecret(t, tn, proj.ID, "dev", "/", "DB_URL")
		if got.SecretValue != "postgres://localhost/app" {
			t.Errorf("secret read back as %q, want postgres://localhost/app", got.SecretValue)
		}
		if got.SecretValueHidden {
			t.Error("the value came back hidden, so nothing downstream could use it")
		}
		if got.SecretPath != "/" {
			t.Errorf("secret is at path %q, want /", got.SecretPath)
		}
	})

	t.Run("ok/the same name in two environments holds two values", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Environments are the point of a secret manager: the same key carries a
			different value per environment, and a create in one must not touch another.`)

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		createSecret(t, tn, proj.ID, "dev", "/", "API_KEY", "dev-value")
		createSecret(t, tn, proj.ID, "prod", "/", "API_KEY", "prod-value")

		if got := getSecret(t, tn, proj.ID, "dev", "/", "API_KEY"); got.SecretValue != "dev-value" {
			t.Errorf("dev holds %q, want dev-value", got.SecretValue)
		}
		if got := getSecret(t, tn, proj.ID, "prod", "/", "API_KEY"); got.SecretValue != "prod-value" {
			t.Errorf("prod holds %q, want prod-value", got.SecretValue)
		}
	})

	t.Run("conflict/creating the same name twice is refused", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Create must not silently overwrite. If it did, a caller expecting to
			add a secret could replace one already in use and never learn about it.`)

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		createSecret(t, tn, proj.ID, "dev", "/", "TOKEN", "first")

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
		if got := getSecret(t, tn, proj.ID, "dev", "/", "TOKEN"); got.SecretValue != "first" {
			t.Errorf("the refused create still changed the value to %q", got.SecretValue)
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

// createSecret writes a secret and fails the test if the API refused it.
//
// A local helper rather than a fixture: only this file needs it, and the conventions
// keep suite-local helpers next to the tests that use them.
func createSecret(t *testing.T, tn *harness.Tenant, projectID, env, path, name, value string) api.CreateSecretV4200JSONResponseBody0 {
	t.Helper()

	res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), name,
		api.CreateSecretV4JSONRequestBody{
			ProjectId:   projectID,
			Environment: env,
			SecretPath:  new(path),
			SecretValue: value,
		})
	if err != nil {
		t.Fatalf("creating secret %s: %v", name, err)
	}
	if res.JSON200 == nil {
		t.Fatalf("creating secret %s returned %d: %s", name, res.StatusCode(), res.Body)
	}

	// The response is a union: a secret, or an approval request when a change policy
	// applies. A tenant has no policy unless a test adds one, so anything else here
	// means the request took a path this test did not intend.
	created, err := res.JSON200.AsCreateSecretV4200JSONResponseBody0()
	if err != nil {
		t.Fatalf("creating secret %s returned an approval request, not a secret: %s", name, res.Body)
	}
	return created
}

func getSecret(t *testing.T, tn *harness.Tenant, projectID, env, path, name string) secretValue {
	t.Helper()

	res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:       projectID,
		Environment:     new(env),
		SecretPath:      new(path),
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValue("true")),
	})
	if err != nil {
		t.Fatalf("reading secret %s: %v", name, err)
	}
	if res.JSON200 == nil {
		t.Fatalf("reading secret %s returned %d: %s", name, res.StatusCode(), res.Body)
	}
	return secretValue{
		SecretValue:       res.JSON200.Secret.SecretValue,
		SecretValueHidden: res.JSON200.Secret.SecretValueHidden,
		SecretPath:        res.JSON200.Secret.SecretPath,
	}
}

type secretValue struct {
	SecretValue       string
	SecretValueHidden bool
	SecretPath        string
}
