package secrets_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// The generated bodies declare metadata as an anonymous struct; an identical alias is
// assignable to it.
type secretMetadataEntry = struct {
	IsEncrypted *bool   `json:"isEncrypted,omitempty"`
	Key         string  `json:"key"`
	Value       *string `json:"value,omitempty"`
}

func configureProject(t *testing.T, proj *fixture.Project, settings api.UpdateProjectJSONRequestBody) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.UpdateProjectWithResponse(t.Context(), proj.ID, settings)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "updating project settings: %s", apierr.Body(res.Body))
}

// rawValue reads a secret's stored value with its references left unexpanded.
func rawValue(t *testing.T, proj *fixture.Project, env, secretPath, name string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretByNameV4WithResponse(t.Context(), name, &api.GetSecretByNameV4Params{
		ProjectId:              proj.ID,
		Environment:            &env,
		SecretPath:             &secretPath,
		ExpandSecretReferences: new(api.GetSecretByNameV4ParamsExpandSecretReferencesFalse),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading %s:%s %s returned %d: %s", env, secretPath, name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Secret.SecretValue
}

// referenceNode is one node of a reference tree. The generated response leaves the
// children untyped, so the body is decoded into this instead.
type referenceNode struct {
	Key         string          `json:"key"`
	Environment string          `json:"environment"`
	SecretPath  string          `json:"secretPath"`
	Value       *string         `json:"value"`
	Children    []referenceNode `json:"children"`
}

func decodeReferenceTree(t *testing.T, body []byte) referenceNode {
	t.Helper()
	var decoded struct {
		Tree referenceNode `json:"tree"`
	}
	require.NoError(t, json.Unmarshal(body, &decoded))
	return decoded.Tree
}

// childLocations names each child as env:path:key, the address a reference uses.
func childLocations(n referenceNode) []string {
	locations := make([]string, 0, len(n.Children))
	for _, c := range n.Children {
		locations = append(locations, c.Environment+":"+c.SecretPath+":"+c.Key)
	}
	return locations
}

// describeOnlyUser can see secret names but not their values.
func describeOnlyUser(t *testing.T, proj *fixture.Project, name string) *harness.Principal {
	t.Helper()
	proj.NewRole(t, "describer", fixture.Permission{Subject: "secrets", Action: []string{"describeSecret"}})
	return proj.NewUser(t, fixture.WithPrincipalName(name), fixture.WithRoles("describer"))
}

func readSecretsTagged(slugs ...string) fixture.Permission {
	return fixture.Permission{
		Subject:    "secrets",
		Action:     []string{"read"},
		Conditions: map[string]any{"secretTags": map[string]any{"$in": slugs}},
	}
}

func newTaggedSecret(t *testing.T, proj *fixture.Project, name string, tagIDs ...string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretV4WithResponse(t.Context(), name,
		api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v", TagIds: &tagIDs})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating %s: %s", name, apierr.Body(res.Body))
}

func listKeys(t *testing.T, pr *harness.Principal, proj *fixture.Project, tagSlugs *string) []string {
	t.Helper()
	res, err := pr.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:   &proj.ID,
		Environment: new("dev"),
		TagSlugs:    tagSlugs,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	keys := make([]string, 0, len(res.JSON200.Secrets))
	for _, s := range res.JSON200.Secrets {
		keys = append(keys, s.SecretKey)
	}
	return keys
}

func listDashboardKeys(t *testing.T, pr *harness.Principal, proj *fixture.Project, search, tags *string) ([]string, float32) {
	t.Helper()
	res, err := pr.API.ListProjectSecretsDetailsWithResponse(t.Context(), &api.ListProjectSecretsDetailsParams{
		ProjectId:   proj.ID,
		Environment: "dev",
		Search:      search,
		Tags:        tags,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "dashboard listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	keys := []string{}
	if res.JSON200.Secrets != nil {
		for _, s := range *res.JSON200.Secrets {
			keys = append(keys, s.SecretKey)
		}
	}
	var total float32
	if res.JSON200.TotalSecretCount != nil {
		total = *res.JSON200.TotalSecretCount
	}
	return keys, total
}
