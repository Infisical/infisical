// Package secretmanager builds Secret Manager resources.
package secretmanager

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// Secret is a narrowed read, since the generated response is a union. ValueHidden
// matters: a hidden value reads as empty rather than as an error.
type Secret struct {
	Value       string
	ValueHidden bool
	Path        string
	Version     float32
}

type SecretOption func(*secretConfig)

type secretConfig struct {
	path string
	as   *harness.Principal
}

// WithPath places the secret somewhere other than the project root.
func WithPath(p string) SecretOption { return func(c *secretConfig) { c.path = p } }

// As acts as a principal other than the tenant administrator, which any test about
// what a member may do needs.
func As(p *harness.Principal) SecretOption { return func(c *secretConfig) { c.as = p } }

func resolve(p *fixture.Project, opts []SecretOption) (secretConfig, *api.ClientWithResponses) {
	cfg := secretConfig{path: "/"}
	for _, o := range opts {
		o(&cfg)
	}
	client := p.Tenant().Admin.API
	if cfg.as != nil {
		client = cfg.as.API
	}
	return cfg, client
}

func CreateSecret(tt *testing.T, p *fixture.Project, env, name, value string, opts ...SecretOption) Secret {
	tt.Helper()
	cfg, client := resolve(p, opts)

	res, err := client.CreateSecretV4WithResponse(tt.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
		SecretValue: value,
	})
	require.NoErrorf(tt, err, "creating secret %s", name)
	require.NotNilf(tt, res.JSON200, "creating secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))

	// A union with an approval request; a tenant has no change policy unless a test
	// adds one, so that branch means an unintended path.
	created, err := res.JSON200.AsCreateSecretV4200JSONResponseBody0()
	require.NoErrorf(tt, err, "creating secret %s returned an approval request: %s", name, res.Body)

	return Secret{Value: created.Secret.SecretValue, Path: cfg.path, Version: created.Secret.Version}
}

func GetSecret(tt *testing.T, p *fixture.Project, env, name string, opts ...SecretOption) Secret {
	tt.Helper()
	cfg, client := resolve(p, opts)

	res, err := client.GetSecretByNameV4WithResponse(tt.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:       p.ID,
		Environment:     &env,
		SecretPath:      &cfg.path,
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValue("true")),
	})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "reading secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	return Secret{
		Value:       res.JSON200.Secret.SecretValue,
		ValueHidden: res.JSON200.Secret.SecretValueHidden,
		Path:        res.JSON200.Secret.SecretPath,
		Version:     res.JSON200.Secret.Version,
	}
}

func DeleteSecret(tt *testing.T, p *fixture.Project, env, name string, opts ...SecretOption) {
	tt.Helper()
	cfg, client := resolve(p, opts)

	res, err := client.DeleteSecretV4WithResponse(tt.Context(), name, api.DeleteSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
	})
	require.NoErrorf(tt, err, "deleting secret %s", name)
	require.NotNilf(tt, res.JSON200, "deleting secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
}
