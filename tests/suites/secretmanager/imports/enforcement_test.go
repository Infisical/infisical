package imports_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

var stagingApp = secretmanager.Location{Env: "staging", Path: "/app"}

func TestImportReplicationEnforcement_ExistingImports(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should leave an existing direct import reading its source when the policy starts requiring approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Action
		secretmanager.UpdateSecret(t, proj, "staging", "KEY", "v2", secretmanager.WithPath(stagingApp.Path))

		// Assert
		require.False(t, importRowByID(t, proj, "prod", "/", prodImport).Replication)
		require.Equal(t, map[string][]string{"KEY": {"v2"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
	})

	t.Run("should list only the direct same-project imports in folders the policy governs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, folder := range []string{"/app", "/other"} {
			secretmanager.CreateFolder(t, proj, "staging", folder)
		}
		secretmanager.CreateFolder(t, proj, "prod", "/governed-elsewhere")
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		secretmanager.GrantFolder(t, other, proj, secretmanager.Location{Env: "dev", Path: "/"})

		listed := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "staging", Path: "/other"},
			secretmanager.Replicated())
		secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "dev", Path: "/"},
			secretmanager.FromProject(other))
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.IntoPath("/governed-elsewhere"))
		createPolicy(t, proj, "prod", "/governed-elsewhere", tn.Admin, false)
		policyID := createPolicy(t, proj, "prod", "/**", tn.Admin, true)

		// Action
		imports := listPolicyImports(t, proj, policyID, api.ListSecretApprovalPolicyImportsParamsIsReplicationFalse)

		// Assert
		require.Len(t, imports, 1)
		require.Equal(t, listed, imports[0].Id)
		require.Equal(t, "/", imports[0].SecretPath)
		require.Equal(t, "staging", imports[0].SourceEnvironment.Slug)
		require.Equal(t, stagingApp.Path, imports[0].SourceSecretPath)
	})

	t.Run("should report each import's own secrets when a folder imports a source both directly and replicated", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `This is the recreate step an admin follows for a direct import. The imports share
			a source, so the dashboard tells a replicated import's secrets apart by import ID, and
			falls back to the source only for direct imports, which share one group per source.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		directImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		secondDirectImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)
		replicatedImport := secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.Replicated())
		waitForOpenRequest(t, proj)

		// Action
		res, err := tn.Admin.API.GetSecretImportsWithResponse(t.Context(),
			&api.GetSecretImportsParams{ProjectId: proj.ID, Environment: "prod", Path: new("/")})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "listing imported secrets returned %s", apierr.Body(res.Body))
		var body struct {
			Secrets []struct {
				ImportId string `json:"importId"`
				Secrets  []struct {
					SecretKey string `json:"secretKey"`
				} `json:"secrets"`
			} `json:"secrets"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &body))
		keysByImport := map[string][]string{}
		for _, group := range body.Secrets {
			keys := []string{}
			for _, secret := range group.Secrets {
				keys = append(keys, secret.SecretKey)
			}
			keysByImport[group.ImportId] = keys
		}
		require.Equal(t, map[string][]string{directImport: {"KEY"}, replicatedImport: {}}, keysByImport)
		require.NotContains(t, keysByImport, secondDirectImport)
	})

	t.Run("should list only the replicated imports when asked for them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, folder := range []string{"/app", "/other"} {
			secretmanager.CreateFolder(t, proj, "staging", folder)
		}
		secretmanager.CreateImport(t, proj, "prod", stagingApp)
		replicated := secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "staging", Path: "/other"},
			secretmanager.Replicated())
		policyID := createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Action
		imports := listPolicyImports(t, proj, policyID, api.ListSecretApprovalPolicyImportsParamsIsReplicationTrue)

		// Assert
		require.Len(t, imports, 1)
		require.Equal(t, replicated, imports[0].Id)
		require.True(t, imports[0].IsReplication)
	})

	t.Run("should refuse to list a policy's imports to a role that cannot read policies", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		policyID := createPolicy(t, proj, "prod", "/", tn.Admin, true)
		proj.NewRole(t, "policy-creator", fixture.Permission{Subject: "secret-approval", Action: []string{"create"}})
		creator := proj.NewUser(t, fixture.WithRoles("policy-creator"))

		// Action
		res, err := creator.API.ListSecretApprovalPolicyImportsWithResponse(t.Context(), policyID,
			&api.ListSecretApprovalPolicyImportsParams{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "listing returned %s", apierr.Body(res.Body))
	})

	t.Run("should refuse to point a direct import at another source in a governed folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, folder := range []string{"/app", "/other"} {
			secretmanager.CreateFolder(t, proj, "staging", folder)
		}
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Action
		res := repoint(t, tn.Admin, proj, "prod", prodImport, secretmanager.Location{Env: "staging", Path: "/other"})

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "repointing returned %s", apierr.Body(res.Body))
		require.Equal(t, stagingApp.Path, importRowByID(t, proj, "prod", "/", prodImport).Path)
	})
}

func TestImportReplicationEnforcement_NewImports(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a new same-project import that ignores the policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Action
		body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "prod", Path: new("/")}
		body.Import.Environment = stagingApp.Env
		body.Import.Path = stagingApp.Path
		res, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating the import returned %s", apierr.Body(res.Body))
		require.Empty(t, listImports(t, proj, "prod", "/"))
	})

	t.Run("should refuse an import that ignores the policy when the folder is named with a path alias", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateFolder(t, proj, "prod", "/app")
		createPolicy(t, proj, "prod", "/app", tn.Admin, true)

		// Action
		body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "prod", Path: new("//app")}
		body.Import.Environment = stagingApp.Env
		body.Import.Path = stagingApp.Path
		res, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating the import returned %s", apierr.Body(res.Body))
		require.Empty(t, listImports(t, proj, "prod", "/app"))
	})

	t.Run("should hold a replicated import's values until each change is approved", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Creating the source secret and creating the import can each queue a replication
			run, and each run that finds the copy unwritten opens its own request, so the claim
			is that at least one is open.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Action
		secretmanager.CreateImport(t, proj, "prod", stagingApp, secretmanager.Replicated())

		// Assert
		waitForOpenRequest(t, proj)
		require.Empty(t, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
		for _, id := range openRequestIDs(t, proj) {
			approveAndMerge(t, tn.Admin, id)
		}
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))

		secretmanager.UpdateSecret(t, proj, "staging", "KEY", "v2", secretmanager.WithPath(stagingApp.Path))
		waitForOpenRequest(t, proj)
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
		// A run queued for the first copy can open its request late, so the change can sit behind it.
		wait.Until(t, "the approved change to reach the import", func() bool {
			if openRequests(t, proj) > 0 {
				for _, id := range openRequestIDs(t, proj) {
					approveAndMerge(t, tn.Admin, id)
				}
			}
			values := importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/"))
			return len(values["KEY"]) == 1 && values["KEY"][0] == "v2"
		}, replicationBudget)
	})

	t.Run("should allow a new cross-project import that reads its source directly", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		target := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, source, "dev", "SHARED", "from-source")
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		secretmanager.GrantFolder(t, source, target, secretmanager.Location{Env: "dev", Path: "/"})
		createPolicy(t, target, "prod", "/", tn.Admin, true)

		// Action
		targetImport := secretmanager.CreateImport(t, target, "prod", secretmanager.Location{Env: "dev", Path: "/"},
			secretmanager.FromProject(source))

		// Assert
		require.False(t, importRowByID(t, target, "prod", "/", targetImport).Replication)
		require.Equal(t, map[string][]string{"SHARED": {"from-source"}},
			importedValues(importedSecrets(t, tn.Admin, target, "prod", "/")))
	})
}

// createPolicy puts a secret change policy with approver as its only approver on env's
// folder at secretPath.
func createPolicy(t *testing.T, proj *fixture.Project, env, secretPath string, approver *harness.Principal, enforce bool) uuid.UUID {
	t.Helper()
	var item api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
	require.NoError(t, item.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
		Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
		Id:   new(approver.ID.String()),
	}))
	res, err := proj.Tenant().Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
		ProjectId:              proj.ID,
		Environment:            &env,
		SecretPath:             secretPath,
		Approvals:              new(float32(1)),
		Approvers:              []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{item},
		EnforceOnSecretImports: &enforce,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Equal(t, enforce, res.JSON200.Approval.EnforceOnSecretImports)
	return res.JSON200.Approval.Id
}

func importRowByID(t *testing.T, proj *fixture.Project, env, folderPath, importID string) importRow {
	t.Helper()
	for _, row := range listImports(t, proj, env, folderPath) {
		if row.ID == importID {
			return row
		}
	}
	require.Failf(t, "import not found", "no import %s in %s:%s", importID, env, folderPath)
	return importRow{}
}

func listPolicyImports(t *testing.T, proj *fixture.Project, policyID uuid.UUID,
	isReplication api.ListSecretApprovalPolicyImportsParamsIsReplication) []struct {
	Environment struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"environment"`
	Id                string `json:"id"`
	IsReplication     bool   `json:"isReplication"`
	SecretPath        string `json:"secretPath"`
	SourceEnvironment struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"sourceEnvironment"`
	SourceSecretPath string `json:"sourceSecretPath"`
} {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretApprovalPolicyImportsWithResponse(t.Context(), policyID,
		&api.ListSecretApprovalPolicyImportsParams{IsReplication: &isReplication})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the policy's imports returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Imports
}

func waitForOpenRequest(t *testing.T, proj *fixture.Project) {
	t.Helper()
	// One worker serves every tenant's replication jobs, so a run can queue behind others.
	wait.Until(t, "the replication to open a change request", func() bool { return openRequests(t, proj) >= 1 },
		replicationBudget)
}

func openRequestIDs(t *testing.T, proj *fixture.Project) []uuid.UUID {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListSecretApprovalRequestsWithResponse(t.Context(), &api.ListSecretApprovalRequestsParams{
		ProjectId: proj.ID, Status: new(api.ListSecretApprovalRequestsParamsStatusOpen),
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := make([]uuid.UUID, 0, len(res.JSON200.Approvals))
	for _, approval := range res.JSON200.Approvals {
		ids = append(ids, approval.Id)
	}
	require.NotEmpty(t, ids)
	return ids
}

func approveAndMerge(t *testing.T, reviewer *harness.Principal, id uuid.UUID) {
	t.Helper()
	review, err := reviewer.API.ReviewSecretApprovalRequestWithResponse(t.Context(), id,
		api.ReviewSecretApprovalRequestJSONRequestBody{Status: api.ReviewSecretApprovalRequestJSONBodyStatusApproved})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, review.StatusCode(), "approving %s returned %s", id, apierr.Body(review.Body))

	merged, err := reviewer.API.MergeSecretApprovalRequestWithResponse(t.Context(), id, api.MergeSecretApprovalRequestJSONRequestBody{})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, merged.StatusCode(), "merging %s returned %s", id, apierr.Body(merged.Body))
}
