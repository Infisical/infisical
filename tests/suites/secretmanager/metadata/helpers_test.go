package metadata_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// The generated bodies declare metadata as an anonymous struct; an identical alias is
// assignable to it.
type entry = struct {
	IsEncrypted *bool   `json:"isEncrypted,omitempty"`
	Key         string  `json:"key"`
	Value       *string `json:"value,omitempty"`
}

func plain(key, value string) entry { return entry{Key: key, Value: &value} }

func encrypted(key, value string) entry {
	return entry{Key: key, Value: &value, IsEncrypted: new(true)}
}

// createWithMetadata creates a secret at the dev root.
func createWithMetadata(t *testing.T, proj *fixture.Project, key string, metadata ...entry) {
	t.Helper()
	body := api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "v"}
	if len(metadata) > 0 {
		body.SecretMetadata = &metadata
	}
	res, err := proj.Tenant().Admin.API.CreateSecretV4WithResponse(t.Context(), key, body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating %s returned %d: %s", key, res.StatusCode(), apierr.Body(res.Body))
	created, err := res.JSON200.AsCreateSecretV4200JSONResponseBody0()
	require.NoError(t, err)
	require.NotEmptyf(t, created.Secret.Id, "creating %s was not applied: %s", key, res.Body)
}

// metadataOf reads a secret's metadata as key to value.
func metadataOf(t *testing.T, proj *fixture.Project, key string) map[string]string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretByNameV4WithResponse(t.Context(), key, &api.GetSecretByNameV4Params{
		ProjectId: proj.ID, Environment: new("dev"),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading %s returned %d: %s", key, res.StatusCode(), apierr.Body(res.Body))
	out := map[string]string{}
	if res.JSON200.Secret.SecretMetadata != nil {
		for _, m := range *res.JSON200.Secret.SecretMetadata {
			v := ""
			if m.Value != nil {
				v = *m.Value
			}
			out[m.Key] = v
		}
	}
	return out
}

type match struct {
	Environment string
	Path        string
	Metadata    map[string]string
}

// searchDashboard runs the dashboard metadata search. Its filters are nested qs
// parameters the generated client cannot express, so they are appended to the query.
func searchDashboard(t *testing.T, pr *harness.Principal, proj *fixture.Project, operator string, filters ...[2]string) map[string]match {
	t.Helper()
	appendFilters := func(_ context.Context, req *http.Request) error {
		q := req.URL.Query()
		q.Set("operator", operator)
		for i, f := range filters {
			q.Set(fmt.Sprintf("filters[%d][key]", i), f[0])
			q.Set(fmt.Sprintf("filters[%d][value]", i), f[1])
			q.Set(fmt.Sprintf("filters[%d][operator]", i), "is")
		}
		req.URL.RawQuery = q.Encode()
		return nil
	}
	res, err := pr.API.SearchSecretsByMetadataWithResponse(t.Context(), &api.SearchSecretsByMetadataParams{ProjectId: proj.ID}, appendFilters)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "searching by metadata returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := map[string]match{}
	for _, s := range res.JSON200.Secrets {
		md := map[string]string{}
		for _, m := range s.Metadata {
			v := ""
			if m.Value != nil {
				v = *m.Value
			}
			md[m.Key] = v
		}
		out[s.SecretKey] = match{Environment: s.Environment, Path: s.SecretPath, Metadata: md}
	}
	return out
}

func keysOf(matches map[string]match) []string {
	out := []string{}
	for k := range matches {
		out = append(out, k)
	}
	return out
}

// listFiltered lists dev's root through the v4 metadataFilter.
func listFiltered(t *testing.T, proj *fixture.Project, filter string) (int, []string, []byte) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId: &proj.ID, Environment: new("dev"), MetadataFilter: &filter,
	})
	require.NoError(t, err)
	keys := []string{}
	if res.JSON200 != nil {
		for _, s := range res.JSON200.Secrets {
			keys = append(keys, s.SecretKey)
		}
	}
	return res.StatusCode(), keys, res.Body
}

// filterPairs builds a metadataFilter with n distinct key and value pairs.
func filterPairs(n int) string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("key=k%d,value=v%d", i, i)
	}
	return strings.Join(out, "|")
}
