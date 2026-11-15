package tags_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// slugsIn lists the project's tags as slugs, oldest first.
func slugsIn(t *testing.T, proj *fixture.Project) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretTagsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing tags returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	slugs := []string{}
	for _, tag := range res.JSON200.Tags {
		slugs = append(slugs, tag.Slug)
	}
	return slugs
}

// tagsOn reads the slugs attached to a secret at the project root in dev.
func tagsOn(t *testing.T, proj *fixture.Project, key string) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretByNameV4WithResponse(t.Context(), key, &api.GetSecretByNameV4Params{
		ProjectId: proj.ID, Environment: new("dev"),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading %s returned %d: %s", key, res.StatusCode(), apierr.Body(res.Body))
	slugs := []string{}
	if res.JSON200.Secret.Tags != nil {
		for _, tag := range *res.JSON200.Secret.Tags {
			slugs = append(slugs, tag.Slug)
		}
	}
	return slugs
}

func createTaggedSecret(t *testing.T, proj *fixture.Project, key string, tagIDs ...string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretV4WithResponse(t.Context(), key, api.CreateSecretV4JSONRequestBody{
		ProjectId: proj.ID, Environment: "dev", SecretValue: "v", TagIds: &tagIDs,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating %s returned %d: %s", key, res.StatusCode(), apierr.Body(res.Body))
}
