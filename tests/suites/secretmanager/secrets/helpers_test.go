package secrets_test

import (
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

func newTag(t *testing.T, proj *fixture.Project, slug string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
		api.CreateSecretTagJSONRequestBody{Slug: slug, Color: "#2563eb"})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating tag %s returned %d: %s", slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Tag.Id.String()
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
