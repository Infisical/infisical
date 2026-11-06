package validation_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// The generated bodies declare the constraints as anonymous structs; identical aliases are
// assignable to them.
type keyConstraints = struct {
	MaxLength      *int    `json:"maxLength,omitempty"`
	MinLength      *int    `json:"minLength,omitempty"`
	RegexPattern   *string `json:"regexPattern,omitempty"`
	RequiredPrefix *string `json:"requiredPrefix,omitempty"`
	RequiredSuffix *string `json:"requiredSuffix,omitempty"`
}

type valueConstraints = struct {
	MaxLength                *int    `json:"maxLength,omitempty"`
	MinLength                *int    `json:"minLength,omitempty"`
	RegexPattern             *string `json:"regexPattern,omitempty"`
	RequiredPrefix           *string `json:"requiredPrefix,omitempty"`
	RequiredSuffix           *string `json:"requiredSuffix,omitempty"`
	UniqueAcrossLastVersions *int    `json:"uniqueAcrossLastVersions,omitempty"`
	UniqueWithinScope        *bool   `json:"uniqueWithinScope,omitempty"`
}

type ruleOption func(*api.CreateStaticSecretsValidationRuleJSONRequestBody)

func inEnv(env string) ruleOption {
	return func(b *api.CreateStaticSecretsValidationRuleJSONRequestBody) { b.Environment = &env }
}

func atPath(p string) ruleOption {
	return func(b *api.CreateStaticSecretsValidationRuleJSONRequestBody) { b.SecretPath = p }
}

func onValues(c valueConstraints) ruleOption {
	return func(b *api.CreateStaticSecretsValidationRuleJSONRequestBody) { b.ValueConstraints = &c }
}

func onKeys(c keyConstraints) ruleOption {
	return func(b *api.CreateStaticSecretsValidationRuleJSONRequestBody) { b.KeyConstraints = &c }
}

func inactive() ruleOption {
	return func(b *api.CreateStaticSecretsValidationRuleJSONRequestBody) { b.IsActive = new(false) }
}

// ruleBody scopes a rule to dev:/ unless an option says otherwise.
func ruleBody(proj *fixture.Project, name string, opts ...ruleOption) api.CreateStaticSecretsValidationRuleJSONRequestBody {
	body := api.CreateStaticSecretsValidationRuleJSONRequestBody{
		Name:        name,
		ProjectId:   proj.ID,
		Environment: new("dev"),
		SecretPath:  "/",
	}
	for _, o := range opts {
		o(&body)
	}
	return body
}

func newRule(t *testing.T, proj *fixture.Project, name string, opts ...ruleOption) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(), ruleBody(proj, name, opts...))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating rule %s: %s", name, apierr.Body(res.Body))
}

func ruleNames(t *testing.T, proj *fixture.Project) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListStaticSecretsValidationRulesWithResponse(t.Context(),
		&api.ListStaticSecretsValidationRulesParams{ProjectId: proj.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing rules returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, r := range res.JSON200.SecretValidationRules {
		names = append(names, r.Name)
	}
	return names
}

func createSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, secretPath, key, value string) *api.CreateSecretV4Response {
	t.Helper()
	res, err := pr.API.CreateSecretV4WithResponse(t.Context(), key, api.CreateSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretPath:  &secretPath,
		SecretValue: value,
	})
	require.NoError(t, err)
	return res
}

func updateSecret(t *testing.T, pr *harness.Principal, proj *fixture.Project, env, key, value string) *api.UpdateSecretV4Response {
	t.Helper()
	res, err := pr.API.UpdateSecretV4WithResponse(t.Context(), key, api.UpdateSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretValue: &value,
	})
	require.NoError(t, err)
	return res
}

func folderNamesAt(t *testing.T, proj *fixture.Project, env, folderPath string) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
		ProjectId:   proj.ID,
		Environment: env,
		Path:        folderPath,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing folders at %s returned %d: %s", folderPath, res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, f := range res.JSON200.Folders {
		names = append(names, f.Name)
	}
	return names
}
