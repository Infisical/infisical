package sharing_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const sharingOff = "Cross-project secret sharing is not enabled for this organization"

var sourceRoot = secretmanager.Location{Env: "dev", Path: "/"}

// sharingProjects is two projects in one organization with sharing turned on and a
// secret in the source's dev root.
func sharingProjects(t *testing.T, tn *harness.Tenant) (source, target *fixture.Project) {
	t.Helper()
	source = fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	target = fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	secretmanager.CreateSecret(t, source, "dev", "SHARED", "from-source")
	secretmanager.AllowCrossProjectSharing(t, tn, true)
	return source, target
}

func createGrant(t *testing.T, actor *harness.Principal, source, target *fixture.Project, from secretmanager.Location) *api.CreateProjectFolderGrantResponse {
	t.Helper()
	res, err := actor.API.CreateProjectFolderGrantWithResponse(t.Context(), api.CreateProjectFolderGrantJSONRequestBody{
		SourceProjectId: source.ID,
		TargetProjectId: target.ID,
		Environment:     from.Env,
		SecretPath:      from.Path,
	})
	require.NoError(t, err)
	return res
}

func revokeGrant(t *testing.T, actor *harness.Principal, source *fixture.Project, grantID string) *api.DeleteProjectFolderGrantResponse {
	t.Helper()
	res, err := actor.API.DeleteProjectFolderGrantWithResponse(t.Context(), uuid.MustParse(grantID),
		&api.DeleteProjectFolderGrantParams{SourceProjectId: source.ID})
	require.NoError(t, err)
	return res
}

// givenGrants is the IDs of the grants source has given, as its administrator sees them.
func givenGrants(t *testing.T, source *fixture.Project) []string {
	t.Helper()
	res, err := source.Tenant().Admin.API.ListProjectFolderGrantsWithResponse(t.Context(),
		&api.ListProjectFolderGrantsParams{SourceProjectId: source.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing grants returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, g := range res.JSON200.Grants {
		ids = append(ids, g.Id.String())
	}
	return ids
}

func receivedGrants(t *testing.T, target *fixture.Project) []string {
	t.Helper()
	res, err := target.Tenant().Admin.API.ListReceivedProjectFolderGrantsWithResponse(t.Context(),
		&api.ListReceivedProjectFolderGrantsParams{TargetProjectId: target.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing received grants returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, g := range res.JSON200.Grants {
		ids = append(ids, g.Id.String())
	}
	return ids
}

func crossImport(t *testing.T, target, source *fixture.Project, from secretmanager.Location, replicated bool) *api.CreateSecretImportResponse {
	t.Helper()
	body := api.CreateSecretImportJSONRequestBody{ProjectId: target.ID, Environment: "dev", IsReplication: &replicated}
	body.Import.Environment = from.Env
	body.Import.Path = from.Path
	body.Import.SourceProjectId = &source.ID
	res, err := target.Tenant().Admin.API.CreateSecretImportWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

func importCount(t *testing.T, proj *fixture.Project) int {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretImportsWithResponse(t.Context(), &api.ListSecretImportsParams{
		ProjectId: proj.ID, Environment: "dev",
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing imports returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return len(res.JSON200.SecretImports)
}

// importedSecrets is what a list of the target's dev root carries in its imports, as
// reader sees it: one map of name to value per import.
func importedSecrets(t *testing.T, reader *harness.Principal, proj *fixture.Project) []map[string]string {
	t.Helper()
	res, err := reader.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     new("dev"),
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

	var body struct {
		Imports []struct {
			Secrets []struct {
				SecretKey   string `json:"secretKey"`
				SecretValue string `json:"secretValue"`
			} `json:"secrets"`
		} `json:"imports"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &body))
	out := make([]map[string]string, 0, len(body.Imports))
	for _, imp := range body.Imports {
		secrets := map[string]string{}
		for _, s := range imp.Secrets {
			secrets[s.SecretKey] = s.SecretValue
		}
		out = append(out, secrets)
	}
	return out
}

// dashboardImports reads the imports the dashboard shows for the target's dev root,
// which is the only reply that says whether an import's grant was revoked.
func dashboardImports(t *testing.T, proj *fixture.Project) map[string]bool {
	t.Helper()
	includeImports := func(_ context.Context, req *http.Request) error {
		q := req.URL.Query()
		q.Set("includeImports", "true")
		req.URL.RawQuery = q.Encode()
		return nil
	}
	res, err := proj.Tenant().Admin.API.ListProjectSecretsDetailsWithResponse(t.Context(),
		&api.ListProjectSecretsDetailsParams{ProjectId: proj.ID, Environment: "dev"}, includeImports)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "dashboard listing returned %s", apierr.Body(res.Body))

	var body struct {
		Imports []struct {
			ID              string `json:"id"`
			IsAccessRevoked bool   `json:"isAccessRevoked"`
		} `json:"imports"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &body))
	revoked := map[string]bool{}
	for _, imp := range body.Imports {
		revoked[imp.ID] = imp.IsAccessRevoked
	}
	return revoked
}
