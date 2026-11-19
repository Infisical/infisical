package servicetokens_test

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

type tokenScope struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

type tokenOptions struct {
	scopes      []tokenScope
	permissions []string
	expiresIn   *int
}

// requestServiceToken asks for a service token as creator. The key material is
// opaque to the server on a project that is not end-to-end encrypted.
func requestServiceToken(t *testing.T, creator *harness.Principal, proj *fixture.Project, opts tokenOptions) *api.CreateServiceTokenResponse {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"name":         "token",
		"workspaceId":  proj.ID,
		"scopes":       opts.scopes,
		"permissions":  opts.permissions,
		"expiresIn":    opts.expiresIn,
		"encryptedKey": "unused",
		"iv":           "unused",
		"tag":          "unused",
	})
	require.NoError(t, err)
	res, err := creator.API.CreateServiceTokenWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

func newServiceToken(t *testing.T, proj *fixture.Project, opts tokenOptions) *api.ClientWithResponses {
	t.Helper()
	res := requestServiceToken(t, proj.Tenant().Admin, proj, opts)
	require.NotNilf(t, res.JSON200, "creating a service token returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return proj.Tenant().Client(t, res.JSON200.ServiceToken)
}

func serviceTokenCount(t *testing.T, proj *fixture.Project) int {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListProjectServiceTokensWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing service tokens returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return len(res.JSON200.ServiceTokenData)
}

func valuesAt(t *testing.T, proj *fixture.Project, secretPath string) map[string]string {
	t.Helper()
	values := map[string]string{}
	for _, s := range secretmanager.ListSecrets(t, proj, "dev", secretmanager.WithPath(secretPath)) {
		values[s.Key] = s.Value
	}
	return values
}

func createSecret(t *testing.T, actor *api.ClientWithResponses, proj *fixture.Project, env, secretPath, name, value string, editors ...api.RequestEditorFn) *api.CreateSecretV4Response {
	t.Helper()
	res, err := actor.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretPath:  &secretPath,
		SecretValue: value,
	}, editors...)
	require.NoError(t, err)
	return res
}

func listSecrets(t *testing.T, actor *api.ClientWithResponses, proj *fixture.Project, env, secretPath string, editors ...api.RequestEditorFn) *api.ListSecretsV4Response {
	t.Helper()
	res, err := actor.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     &env,
		SecretPath:      &secretPath,
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	}, editors...)
	require.NoError(t, err)
	return res
}

func keysOf(res *api.ListSecretsV4Response) []string {
	keys := []string{}
	if res.JSON200 == nil {
		return keys
	}
	for _, s := range res.JSON200.Secrets {
		keys = append(keys, s.SecretKey)
	}
	return keys
}

// waitForStatus polls a call until it answers with the wanted status. Membership and
// role changes reach the permission cache up to 10 seconds late.
func waitForStatus(t *testing.T, want int, call func() (int, []byte)) []byte {
	t.Helper()
	var last []byte
	_, err := wait.For(t.Context(), func(context.Context) (struct{}, bool, error) {
		status, body := call()
		last = body
		return struct{}{}, status == want, nil
	})
	require.NoErrorf(t, err, "waiting for %d, last body: %s", want, apierr.Body(last))
	return last
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}
