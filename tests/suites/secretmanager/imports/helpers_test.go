package imports_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// importRow is one import of a folder as the import list returns it, reserved
// replication imports included.
type importRow struct {
	ID                string
	Env               string
	Path              string
	Position          int
	Replication       bool
	Reserved          bool
	LastReplicated    *time.Time
	ReplicationOK     bool
	ReplicationStatus string
}

func listImports(t *testing.T, proj *fixture.Project, env, folderPath string) []importRow {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretImportsWithResponse(t.Context(), &api.ListSecretImportsParams{
		ProjectId: proj.ID, Environment: env, Path: &folderPath,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing imports of %s:%s returned %d: %s",
		env, folderPath, res.StatusCode(), apierr.Body(res.Body))

	rows := make([]importRow, 0, len(res.JSON200.SecretImports))
	for _, imp := range res.JSON200.SecretImports {
		row := importRow{
			ID:             imp.Id.String(),
			Env:            imp.ImportEnv.Slug,
			Path:           imp.ImportPath,
			Position:       int(imp.Position),
			Replication:    imp.IsReplication != nil && *imp.IsReplication,
			Reserved:       imp.IsReserved != nil && *imp.IsReserved,
			LastReplicated: imp.LastReplicated,
			ReplicationOK:  imp.IsReplicationSuccess != nil && *imp.IsReplicationSuccess,
		}
		if imp.ReplicationStatus != nil {
			row.ReplicationStatus = *imp.ReplicationStatus
		}
		rows = append(rows, row)
	}
	return rows
}

func importIDs(rows []importRow) []string {
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	return ids
}

func positions(rows []importRow) []int {
	out := make([]int, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Position)
	}
	return out
}

// importedGroup is one import as a secret list carries it: where it reads from and
// the secrets it contributes, keyed by name.
type importedGroup struct {
	Env     string
	Path    string
	Secrets map[string]string
}

// importedSecrets lists a folder as reader, which is what an application pulling its
// secrets sees, and returns the imports part of the reply.
func importedSecrets(t *testing.T, reader *harness.Principal, proj *fixture.Project, env, folderPath string) []importedGroup {
	t.Helper()
	res, err := reader.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     &env,
		SecretPath:      &folderPath,
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing %s:%s returned %d: %s", env, folderPath, res.StatusCode(), apierr.Body(res.Body))

	var body struct {
		Imports []struct {
			Environment string `json:"environment"`
			SecretPath  string `json:"secretPath"`
			Secrets     []struct {
				SecretKey   string `json:"secretKey"`
				SecretValue string `json:"secretValue"`
			} `json:"secrets"`
		} `json:"imports"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &body))

	groups := make([]importedGroup, 0, len(body.Imports))
	for _, imp := range body.Imports {
		g := importedGroup{Env: imp.Environment, Path: imp.SecretPath, Secrets: map[string]string{}}
		for _, s := range imp.Secrets {
			require.NotContainsf(t, g.Secrets, s.SecretKey, "the import of %s:%s lists %s more than once", imp.Environment, imp.SecretPath, s.SecretKey)
			g.Secrets[s.SecretKey] = s.SecretValue
		}
		groups = append(groups, g)
	}
	return groups
}

// importedValues flattens a list's imports into every value each name has across them.
func importedValues(groups []importedGroup) map[string][]string {
	out := map[string][]string{}
	for _, g := range groups {
		for k, v := range g.Secrets {
			out[k] = append(out[k], v)
		}
	}
	return out
}

func importInto(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, folderPath string, from secretmanager.Location) *api.CreateSecretImportResponse {
	t.Helper()
	body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: env, Path: &folderPath}
	body.Import.Environment = from.Env
	body.Import.Path = from.Path
	res, err := actor.API.CreateSecretImportWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

func repoint(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, importID string, to secretmanager.Location) *api.UpdateSecretImportResponse {
	t.Helper()
	body := api.UpdateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: env, Path: new("/")}
	body.Import.Environment = &to.Env
	body.Import.Path = &to.Path
	res, err := actor.API.UpdateSecretImportWithResponse(t.Context(), importID, body)
	require.NoError(t, err)
	return res
}

// replicationBudget is longer than the default wait because one worker serves every
// tenant's replication jobs, and a job that meets a lock retries with backoff, so a run
// queues behind others on a busy runner.
var replicationBudget = wait.Timeout(60 * time.Second)

// waitReplicated waits until a replication import records a run newer than after, then
// requires that run to have succeeded. It returns the run's time, for the next wait.
//
// The replicator records a run only when it changed something, so a wait after a no-op
// times out rather than passing on a stale timestamp.
func waitReplicated(t *testing.T, proj *fixture.Project, env, folderPath, importID string, after time.Time) time.Time {
	t.Helper()
	var last importRow
	wait.Until(t, "the replication import to record a new run", func() bool {
		for _, row := range listImports(t, proj, env, folderPath) {
			if row.ID == importID {
				last = row
				return row.LastReplicated != nil && row.LastReplicated.After(after)
			}
		}
		return false
	}, replicationBudget)
	require.Truef(t, last.ReplicationOK, "replication failed: %s", last.ReplicationStatus)
	return *last.LastReplicated
}
