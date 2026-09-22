// Package secret creates and reads secrets in a project.
//
// Environment, name and value are positional because the API refuses a request
// without them. Everything the schema marks optional is an option, so a test that
// needs metadata, a different path or a different actor adds one rather than
// changing every call site.
package secret

import (
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/project"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
)

// Value is what a read returns.
//
// A narrowed view rather than the generated struct, because the response is a union
// and the fields worth asserting on are few. SecretValueHidden is one of them: a
// value that came back hidden is useless to anything downstream, and reads as empty
// rather than as an error.
type Value struct {
	Value       string
	ValueHidden bool
	Path        string
	Version     float32
}

// Option adjusts a secret operation.
type Option func(*config)

type config struct {
	path string
	as   *harness.Principal
}

// Path places the secret somewhere other than the project root.
func Path(p string) Option { return func(c *config) { c.path = p } }

// As performs the operation as a principal other than the tenant administrator.
//
// Required for any test about what a member may do. Reaching for tn.Admin because it
// is to hand makes the claim vacuous, which is why this exists before anything needs
// it.
func As(p *harness.Principal) Option { return func(c *config) { c.as = p } }

func resolve(p *project.Project, opts []Option) (config, *api.ClientWithResponses) {
	cfg := config{path: "/"}
	for _, o := range opts {
		o(&cfg)
	}
	client := p.Tenant().Admin.API
	if cfg.as != nil {
		client = cfg.as.API
	}
	return cfg, client
}

// Create adds a secret and returns what the API reported.
func Create(tt *testing.T, p *project.Project, env, name, value string, opts ...Option) Value {
	tt.Helper()
	cfg, client := resolve(p, opts)

	body := api.CreateSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
		SecretValue: value,
	}
	res, err := client.CreateSecretV4WithResponse(tt.Context(), name, body)
	if err != nil {
		tt.Fatalf("secret: creating %s: %v", name, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("secret: creating %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	}

	// The response is a union: a secret, or an approval request when a change policy
	// applies. A tenant has no policy unless a test adds one, so anything else means
	// the request took a path the test did not intend.
	created, err := res.JSON200.AsCreateSecretV4200JSONResponseBody0()
	if err != nil {
		tt.Fatalf("secret: creating %s returned an approval request, not a secret: %s", name, res.Body)
	}
	return Value{
		Value:   created.Secret.SecretValue,
		Path:    cfg.path,
		Version: created.Secret.Version,
	}
}

// Get reads a secret back, failing the test if it is not there.
func Get(tt *testing.T, p *project.Project, env, name string, opts ...Option) Value {
	tt.Helper()
	v, err := TryGet(tt, p, env, name, opts...)
	if err != nil {
		tt.Fatalf("secret: %v", err)
	}
	return v
}

// TryGet is Get without failing, for asserting that a secret is absent.
func TryGet(tt *testing.T, p *project.Project, env, name string, opts ...Option) (Value, error) {
	tt.Helper()
	cfg, client := resolve(p, opts)

	res, err := client.GetSecretByNameV4WithResponse(tt.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:       p.ID,
		Environment:     &env,
		SecretPath:      &cfg.path,
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValue("true")),
	})
	if err != nil {
		return Value{}, err
	}
	if res.JSON200 == nil {
		return Value{}, fmt.Errorf("reading secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	}
	return Value{
		Value:       res.JSON200.Secret.SecretValue,
		ValueHidden: res.JSON200.Secret.SecretValueHidden,
		Path:        res.JSON200.Secret.SecretPath,
		Version:     res.JSON200.Secret.Version,
	}, nil
}

// Delete removes a secret.
func Delete(tt *testing.T, p *project.Project, env, name string, opts ...Option) {
	tt.Helper()
	cfg, client := resolve(p, opts)

	res, err := client.DeleteSecretV4WithResponse(tt.Context(), name, api.DeleteSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
	})
	if err != nil {
		tt.Fatalf("secret: deleting %s: %v", name, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("secret: deleting %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	}
}
