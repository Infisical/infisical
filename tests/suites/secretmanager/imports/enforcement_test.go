package imports_test

import (
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

func TestImportReplicationEnforcement_Conversion(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep an existing import's values when a new policy requires approval for imported secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)

		// Action
		createPolicy(t, proj, "prod", "/", tn.Admin, true)

		// Assert
		waitConverted(t, proj, "prod", "/", prodImport)
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
		require.Zero(t, openRequests(t, proj))
	})

	t.Run("should convert an existing import when the option is turned on for an existing policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		policyID := createPolicy(t, proj, "prod", "/", tn.Admin, false)
		require.False(t, importRowByID(t, proj, "prod", "/", prodImport).Replication)

		// Action
		setImportEnforcement(t, proj, policyID, tn.Admin, true)

		// Assert
		waitConverted(t, proj, "prod", "/", prodImport)
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
	})

	t.Run("should hold a source change after conversion until it is approved", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", stagingApp.Path)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath(stagingApp.Path))
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)
		waitConverted(t, proj, "prod", "/", prodImport)

		// Action
		secretmanager.UpdateSecret(t, proj, "staging", "KEY", "v2", secretmanager.WithPath(stagingApp.Path))

		// Assert
		waitForOpenRequest(t, proj)
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))

		approveAndMerge(t, tn.Admin, openRequestIDs(t, proj)[0])
		require.Equal(t, map[string][]string{"KEY": {"v2"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
	})
}

func TestImportReplicationEnforcement_NewImports(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should make a new same-project import a replication import whose values wait for approval", func(t *testing.T) {
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
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)

		// Assert
		require.True(t, importRowByID(t, proj, "prod", "/", prodImport).Replication)
		waitForOpenRequest(t, proj)
		require.Empty(t, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))

		approveAndMerge(t, tn.Admin, openRequestIDs(t, proj)[0])
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
	})

	t.Run("should hold the new source's values when a governed import is repointed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, folder := range []string{"/app", "/other"} {
			secretmanager.CreateFolder(t, proj, "staging", folder)
		}
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "v1", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "staging", "OTHER_KEY", "other", secretmanager.WithPath("/other"))
		prodImport := secretmanager.CreateImport(t, proj, "prod", stagingApp)
		createPolicy(t, proj, "prod", "/", tn.Admin, true)
		waitConverted(t, proj, "prod", "/", prodImport)

		// Action
		res := repoint(t, tn.Admin, proj, "prod", prodImport, secretmanager.Location{Env: "staging", Path: "/other"})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "repointing returned %s", apierr.Body(res.Body))
		waitForOpenRequest(t, proj)
		require.Equal(t, map[string][]string{"KEY": {"v1"}}, importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))

		approveAndMerge(t, tn.Admin, openRequestIDs(t, proj)[0])
		require.Equal(t, map[string][]string{"OTHER_KEY": {"other"}},
			importedValues(importedSecrets(t, tn.Admin, proj, "prod", "/")))
	})

	t.Run("should leave a new cross-project import reading its source directly", func(t *testing.T) {
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
		ProjectId:                proj.ID,
		Environment:              &env,
		SecretPath:               secretPath,
		Approvals:                new(float32(1)),
		Approvers:                []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{item},
		EnforceImportReplication: &enforce,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Equal(t, enforce, res.JSON200.Approval.EnforceImportReplication)
	return res.JSON200.Approval.Id
}

func setImportEnforcement(t *testing.T, proj *fixture.Project, policyID uuid.UUID, approver *harness.Principal, enforce bool) {
	t.Helper()
	var item api.UpdateSecretApprovalPolicyJSONBody_Approvers_Item
	require.NoError(t, item.FromUpdateSecretApprovalPolicyJSONBodyApprovers1(api.UpdateSecretApprovalPolicyJSONBodyApprovers1{
		Type: api.UpdateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
		Id:   new(approver.ID.String()),
	}))
	res, err := proj.Tenant().Admin.API.UpdateSecretApprovalPolicyWithResponse(t.Context(), policyID.String(),
		api.UpdateSecretApprovalPolicyJSONRequestBody{
			Approvers:                []api.UpdateSecretApprovalPolicyJSONBody_Approvers_Item{item},
			EnforceImportReplication: &enforce,
		})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "updating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Equal(t, enforce, res.JSON200.Approval.EnforceImportReplication)
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

// waitConverted waits for the policy change's conversion, which runs after the change
// commits, to turn the import into a replication import.
func waitConverted(t *testing.T, proj *fixture.Project, env, folderPath, importID string) {
	t.Helper()
	var last importRow
	wait.Until(t, "the import to become a replication import", func() bool {
		last = importRowByID(t, proj, env, folderPath, importID)
		return last.Replication
	}, replicationBudget)
	require.Truef(t, last.ReplicationOK, "conversion failed: %s", last.ReplicationStatus)
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
