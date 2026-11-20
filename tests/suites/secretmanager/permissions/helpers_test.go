package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func newProject(t *testing.T, tn *harness.Tenant) *fixture.Project {
	t.Helper()
	return fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
}

func allow(subject string, actions ...string) fixture.Permission {
	return fixture.Permission{Subject: subject, Action: actions}
}

func allowWhere(subject string, conditions map[string]any, actions ...string) fixture.Permission {
	return fixture.Permission{Subject: subject, Action: actions, Conditions: conditions}
}

func deny(p fixture.Permission) fixture.Permission {
	p.Inverted = true
	return p
}

// listing is one v4 list: its status and, on success, each secret's value by key.
type listing struct {
	status int
	body   []byte
	values map[string]string
	hidden map[string]bool
}

func listSecrets(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath string, recursive bool) listing {
	t.Helper()
	params := &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     &env,
		SecretPath:      &secretPath,
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	}
	if recursive {
		params.Recursive = new(api.ListSecretsV4ParamsRecursiveTrue)
	}
	res, err := pr.API.ListSecretsV4WithResponse(t.Context(), params)
	require.NoError(t, err)
	out := listing{status: res.StatusCode(), body: res.Body, values: map[string]string{}, hidden: map[string]bool{}}
	if res.JSON200 != nil {
		for _, s := range res.JSON200.Secrets {
			out.values[s.SecretKey] = s.SecretValue
			out.hidden[s.SecretKey] = s.SecretValueHidden
		}
	}
	return out
}

func readSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath, name string) *api.GetSecretByNameV4Response {
	t.Helper()
	res, err := pr.API.GetSecretByNameV4WithResponse(t.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:       proj.ID,
		Environment:     &env,
		SecretPath:      &secretPath,
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValueTrue),
	})
	require.NoError(t, err)
	return res
}

func createSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath, name, value string) *api.CreateSecretV4Response {
	t.Helper()
	res, err := pr.API.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretPath:  &secretPath,
		SecretValue: value,
	})
	require.NoError(t, err)
	return res
}

func updateSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath, name string, body api.UpdateSecretV4JSONRequestBody) *api.UpdateSecretV4Response {
	t.Helper()
	body.ProjectId, body.Environment, body.SecretPath = proj.ID, env, &secretPath
	res, err := pr.API.UpdateSecretV4WithResponse(t.Context(), name, body)
	require.NoError(t, err)
	return res
}

func deleteSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath, name string) *api.DeleteSecretV4Response {
	t.Helper()
	res, err := pr.API.DeleteSecretV4WithResponse(t.Context(), name, api.DeleteSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretPath:  &secretPath,
	})
	require.NoError(t, err)
	return res
}

// secretsAt is what the administrator sees in one folder, by key.
func secretsAt(t *testing.T, proj *fixture.Project, env, secretPath string) map[string]string {
	t.Helper()
	got := listSecrets(t, proj.Tenant().Admin, proj, env, secretPath, false)
	require.Equalf(t, http.StatusOK, got.status, "listing %s:%s as the admin: %s", env, secretPath, apierr.Body(got.body))
	return got.values
}

func keysOf(values map[string]string) []string {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	return keys
}
