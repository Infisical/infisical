// Package secretmanager builds Secret Manager resources.
package secretmanager

import (
	"path"
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
	ID          string
	Key         string
	Value       string
	ValueHidden bool
	Path        string
	Version     float32
}

type SecretOption func(*secretConfig)

type secretConfig struct {
	path     string
	as       *harness.Principal
	personal bool
}

// WithPath places the secret somewhere other than the project root.
func WithPath(p string) SecretOption { return func(c *secretConfig) { c.path = p } }

// As acts as a principal other than the tenant administrator, which any test about
// what a member may do needs.
func As(p *harness.Principal) SecretOption { return func(c *secretConfig) { c.as = p } }

// WithPersonal targets the actor's personal override instead of the shared secret.
// On ListSecrets it asks for the actor's overrides to be included.
func WithPersonal() SecretOption { return func(c *secretConfig) { c.personal = true } }

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

	secretType := api.CreateSecretV4JSONBodyTypeShared
	if cfg.personal {
		secretType = api.CreateSecretV4JSONBodyTypePersonal
	}

	res, err := client.CreateSecretV4WithResponse(tt.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
		SecretValue: value,
		Type:        &secretType,
	})
	require.NoErrorf(tt, err, "creating secret %s", name)
	require.NotNilf(tt, res.JSON200, "creating secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))

	// The generated unwrap only unmarshals, so an approval reply decodes into an
	// empty secret without error; a missing id is how a held write shows.
	created, err := res.JSON200.AsCreateSecretV4200JSONResponseBody0()
	require.NoError(tt, err)
	require.NotEmptyf(tt, created.Secret.Id, "creating secret %s was not applied (held for approval?): %s", name, res.Body)

	return Secret{
		ID:      created.Secret.Id,
		Key:     created.Secret.SecretKey,
		Value:   created.Secret.SecretValue,
		Path:    cfg.path,
		Version: created.Secret.Version,
	}
}

func UpdateSecret(tt *testing.T, p *fixture.Project, env, name, value string, opts ...SecretOption) Secret {
	tt.Helper()
	cfg, client := resolve(p, opts)

	secretType := api.UpdateSecretV4JSONBodyTypeShared
	if cfg.personal {
		secretType = api.UpdateSecretV4JSONBodyTypePersonal
	}

	res, err := client.UpdateSecretV4WithResponse(tt.Context(), name, api.UpdateSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
		SecretValue: &value,
		Type:        &secretType,
	})
	require.NoErrorf(tt, err, "updating secret %s", name)
	require.NotNilf(tt, res.JSON200, "updating secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))

	updated, err := res.JSON200.AsUpdateSecretV4200JSONResponseBody0()
	require.NoError(tt, err)
	require.NotEmptyf(tt, updated.Secret.Id, "updating secret %s was not applied (held for approval?): %s", name, res.Body)

	return Secret{
		ID:          updated.Secret.Id,
		Key:         updated.Secret.SecretKey,
		Value:       updated.Secret.SecretValue,
		ValueHidden: updated.Secret.SecretValueHidden,
		Path:        cfg.path,
		Version:     updated.Secret.Version,
	}
}

// ListSecrets reads one folder with references expanded, which is what an
// application pulling its secrets sees.
func ListSecrets(tt *testing.T, p *fixture.Project, env string, opts ...SecretOption) []Secret {
	tt.Helper()
	cfg, client := resolve(p, opts)

	includePersonal := api.ListSecretsV4ParamsIncludePersonalOverridesFalse
	if cfg.personal {
		includePersonal = api.ListSecretsV4ParamsIncludePersonalOverridesTrue
	}

	res, err := client.ListSecretsV4WithResponse(tt.Context(), &api.ListSecretsV4Params{
		ProjectId:                &p.ID,
		Environment:              &env,
		SecretPath:               &cfg.path,
		ViewSecretValue:          new(api.ListSecretsV4ParamsViewSecretValueTrue),
		IncludePersonalOverrides: &includePersonal,
	})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "listing secrets in %s:%s returned %d: %s",
		env, cfg.path, res.StatusCode(), apierr.Body(res.Body))

	secrets := make([]Secret, 0, len(res.JSON200.Secrets))
	for _, s := range res.JSON200.Secrets {
		secretPath := cfg.path
		if s.SecretPath != nil {
			secretPath = *s.SecretPath
		}
		secrets = append(secrets, Secret{
			ID:          s.Id,
			Key:         s.SecretKey,
			Value:       s.SecretValue,
			ValueHidden: s.SecretValueHidden,
			Path:        secretPath,
			Version:     s.Version,
		})
	}
	return secrets
}

// CreateFolder creates a folder at an absolute path such as "/app/api". Missing
// parents are created by the server.
func CreateFolder(tt *testing.T, p *fixture.Project, env, folderPath string, opts ...SecretOption) {
	tt.Helper()
	_, client := resolve(p, opts)

	parent, name := path.Split(path.Clean(folderPath))
	res, err := client.CreateSecretFolderWithResponse(tt.Context(), api.CreateSecretFolderJSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		Name:        name,
		Path:        &parent,
	})
	require.NoErrorf(tt, err, "creating folder %s", folderPath)
	require.NotNilf(tt, res.JSON200, "creating folder %s in %s returned %d: %s",
		folderPath, env, res.StatusCode(), apierr.Body(res.Body))
}

func GetSecret(tt *testing.T, p *fixture.Project, env, name string, opts ...SecretOption) Secret {
	tt.Helper()
	cfg, client := resolve(p, opts)

	secretType := api.GetSecretByNameV4ParamsTypeShared
	if cfg.personal {
		secretType = api.GetSecretByNameV4ParamsTypePersonal
	}

	res, err := client.GetSecretByNameV4WithResponse(tt.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:       p.ID,
		Environment:     &env,
		SecretPath:      &cfg.path,
		Type:            &secretType,
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValue("true")),
	})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "reading secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	return Secret{
		ID:          res.JSON200.Secret.Id,
		Key:         res.JSON200.Secret.SecretKey,
		Value:       res.JSON200.Secret.SecretValue,
		ValueHidden: res.JSON200.Secret.SecretValueHidden,
		Path:        res.JSON200.Secret.SecretPath,
		Version:     res.JSON200.Secret.Version,
	}
}

func DeleteSecret(tt *testing.T, p *fixture.Project, env, name string, opts ...SecretOption) {
	tt.Helper()
	cfg, client := resolve(p, opts)

	secretType := api.DeleteSecretV4JSONBodyTypeShared
	if cfg.personal {
		secretType = api.DeleteSecretV4JSONBodyTypePersonal
	}

	res, err := client.DeleteSecretV4WithResponse(tt.Context(), name, api.DeleteSecretV4JSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &cfg.path,
		Type:        &secretType,
	})
	require.NoErrorf(tt, err, "deleting secret %s", name)
	require.NotNilf(tt, res.JSON200, "deleting secret %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))
	deleted, err := res.JSON200.AsDeleteSecretV4200JSONResponseBody0()
	require.NoError(tt, err)
	require.NotEmptyf(tt, deleted.Secret.Id, "deleting secret %s was not applied (held for approval?): %s", name, res.Body)
}
