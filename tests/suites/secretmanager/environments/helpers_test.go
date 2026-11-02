package environments_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

type projectEnvs struct {
	active  []string
	deleted []string
	ids     map[string]string
	names   map[string]string
}

// readEnvs reads the project's environments in display order, and the ones pending
// deletion, as the admin sees them.
func readEnvs(t *testing.T, proj *fixture.Project) projectEnvs {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.Truef(t, res.JSON200 != nil && res.JSON200.Project != nil, "reading the project returned %d: %s",
		res.StatusCode(), apierr.Body(res.Body))
	envs := projectEnvs{active: []string{}, deleted: []string{}, ids: map[string]string{}, names: map[string]string{}}
	for _, e := range res.JSON200.Project.Environments {
		envs.active = append(envs.active, e.Slug)
		envs.ids[e.Slug] = e.Id
		envs.names[e.Slug] = e.Name
	}
	for _, e := range res.JSON200.Project.DeletedEnvironments {
		envs.deleted = append(envs.deleted, e.Slug)
	}
	return envs
}

func envID(t *testing.T, proj *fixture.Project, slug string) string {
	t.Helper()
	id, ok := readEnvs(t, proj).ids[slug]
	require.Truef(t, ok, "environment %s is not active", slug)
	return id
}

func createEnv(t *testing.T, proj *fixture.Project, slug string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
		api.CreateEnvironmentJSONRequestBody{Name: slug, Slug: slug})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating environment %s returned %d: %s", slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Environment.Id.String()
}

func deleteEnv(t *testing.T, proj *fixture.Project, id string, hard bool) {
	t.Helper()
	params := &api.DeleteEnvironmentParams{}
	if hard {
		params.HardDelete = new(api.DeleteEnvironmentParamsHardDeleteTrue)
	}
	res, err := proj.Tenant().Admin.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, id, params)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting environment %s returned %s", id, apierr.Body(res.Body))
}
