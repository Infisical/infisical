package insights_test

import (
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

type found struct {
	ProjectID string
	// Where is env + path + key, for example "dev/nested/KEY", so a set of matches
	// compares as one sorted list.
	Where string
}

func searchByValue(t *testing.T, pr *harness.Principal, value string) []found {
	t.Helper()
	res, err := pr.API.SearchOrgInsightsSecretsByValueWithResponse(t.Context(),
		api.SearchOrgInsightsSecretsByValueJSONRequestBody{SecretValue: value})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "searching by value returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := make([]found, 0, len(res.JSON200.Secrets))
	for _, s := range res.JSON200.Secrets {
		path := s.SecretPath
		if path != "/" {
			path += "/"
		}
		out = append(out, found{ProjectID: s.ProjectId, Where: s.Environment.Slug + path + s.Key})
	}
	return out
}

func wheres(fs []found) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.Where)
	}
	slices.Sort(out)
	return out
}
