package imports_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

const planRestriction = "Failed to create secret replication due to plan restriction. Upgrade plan to create replication."

func TestSecretReplication_Copy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	inEveryEnv := func(t *testing.T, proj *fixture.Project, folderPath string) {
		t.Helper()
		if folderPath == "/" {
			return
		}
		for _, env := range []string{"dev", "staging", "prod"} {
			secretmanager.CreateFolder(t, proj, env, folderPath)
		}
	}

	for _, folderPath := range []string{"/", "/deep"} {
		t.Run(fmt.Sprintf("should copy a secret created at the source into the replica at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: folderPath},
				secretmanager.IntoPath(folderPath), secretmanager.Replicated())

			// Action
			secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "stage-value", secretmanager.WithPath(folderPath))

			// Assert
			waitReplicated(t, proj, "dev", folderPath, devImport, time.Time{})
			require.Equal(t, "stage-value", secretmanager.GetSecret(t, proj, "dev", "STAGING_KEY", secretmanager.WithPath(folderPath)).Value)
			require.Equal(t, map[string][]string{"STAGING_KEY": {"stage-value"}},
				importedValues(importedSecrets(t, tn.Admin, proj, "dev", folderPath)))
		})

		t.Run(fmt.Sprintf("should carry a secret two replications deep when dev replicates staging and staging replicates prod at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: folderPath},
				secretmanager.IntoPath(folderPath), secretmanager.Replicated())
			stagingImport := secretmanager.CreateImport(t, proj, "staging", secretmanager.Location{Env: "prod", Path: folderPath},
				secretmanager.IntoPath(folderPath), secretmanager.Replicated())

			// Action
			secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod-value", secretmanager.WithPath(folderPath))

			// Assert
			waitReplicated(t, proj, "staging", folderPath, stagingImport, time.Time{})
			waitReplicated(t, proj, "dev", folderPath, devImport, time.Time{})
			require.Equal(t, "prod-value", secretmanager.GetSecret(t, proj, "dev", "PROD_KEY", secretmanager.WithPath(folderPath)).Value)
			require.Equal(t, []string{"prod-value"}, importedValues(importedSecrets(t, tn.Admin, proj, "dev", folderPath))["PROD_KEY"])
		})

		t.Run(fmt.Sprintf("should replicate several sources into one folder at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			fromStaging := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: folderPath},
				secretmanager.IntoPath(folderPath), secretmanager.Replicated())
			fromProd := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: folderPath},
				secretmanager.IntoPath(folderPath), secretmanager.Replicated())

			// Action
			secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "stage-value", secretmanager.WithPath(folderPath))
			secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod-value", secretmanager.WithPath(folderPath))

			// Assert
			waitReplicated(t, proj, "dev", folderPath, fromStaging, time.Time{})
			waitReplicated(t, proj, "dev", folderPath, fromProd, time.Time{})
			require.Equal(t, map[string][]string{"STAGING_KEY": {"stage-value"}, "PROD_KEY": {"prod-value"}},
				importedValues(importedSecrets(t, tn.Admin, proj, "dev", folderPath)))
		})
	}

	t.Run("should copy the source's existing secrets as soon as the replication import is created", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "existing")

		// Action
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())

		// Assert
		waitReplicated(t, proj, "dev", "/", devImport, time.Time{})
		require.Equal(t, "existing", secretmanager.GetSecret(t, proj, "dev", "KEY").Value)
	})

	t.Run("should propagate an update at the source to the replica", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "before")
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())
		first := waitReplicated(t, proj, "dev", "/", devImport, time.Time{})

		// Action
		secretmanager.UpdateSecret(t, proj, "staging", "KEY", "after")

		// Assert
		waitReplicated(t, proj, "dev", "/", devImport, first)
		require.Equal(t, "after", secretmanager.GetSecret(t, proj, "dev", "KEY").Value)
	})

	t.Run("should remove a secret from the replica once it is deleted at the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "value")
		secretmanager.CreateSecret(t, proj, "staging", "KEPT", "value")
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())
		first := waitReplicated(t, proj, "dev", "/", devImport, time.Time{})

		// Action
		secretmanager.DeleteSecret(t, proj, "staging", "KEY")

		// Assert
		waitReplicated(t, proj, "dev", "/", devImport, first)
		require.Equal(t, map[string][]string{"KEPT": {"value"}}, importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/")))
	})

	t.Run("should replicate the source's own value of a key it also imports, once", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", "/upstream")
		secretmanager.CreateFolder(t, proj, "staging", "/source")
		secretmanager.CreateSecret(t, proj, "staging", "OVERLAP_KEY", "upstream-value", secretmanager.WithPath("/upstream"))
		secretmanager.CreateSecret(t, proj, "staging", "UPSTREAM_ONLY_KEY", "upstream-only-value", secretmanager.WithPath("/upstream"))
		secretmanager.CreateSecret(t, proj, "staging", "OVERLAP_KEY", "source-value", secretmanager.WithPath("/source"))
		secretmanager.CreateImport(t, proj, "staging", secretmanager.Location{Env: "staging", Path: "/upstream"},
			secretmanager.IntoPath("/source"))

		// Action
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/source"},
			secretmanager.Replicated())

		// Assert
		waitReplicated(t, proj, "dev", "/", devImport, time.Time{})
		require.Equal(t, map[string][]string{
			"OVERLAP_KEY":       {"source-value"},
			"UPSTREAM_ONLY_KEY": {"upstream-only-value"},
		}, importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/")))
	})

	t.Run("should open a change request instead of writing when the replica path has a policy", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Creating the source secret and creating the import each queue a replication
			run, and each run that finds the replica unwritten opens its own request, so the
			claim is that at least one is open, not exactly one.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/"}, tn.Admin)
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "value")

		// Action
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())

		// Assert
		waitReplicated(t, proj, "dev", "/", devImport, time.Time{})
		require.GreaterOrEqual(t, openRequests(t, proj), 1)
		require.Empty(t, importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/")))
	})
}

func TestSecretReplication_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the reserved import and its folder when the replication import is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "value")
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())
		waitReplicated(t, proj, "dev", "/", devImport, time.Time{})
		reserved := "/__reserve_replication_" + devImport
		require.Equal(t, http.StatusOK, listAt(t, tn.Admin, proj, "dev", reserved).StatusCode())

		// Action
		res, err := tn.Admin.API.DeleteSecretImportWithResponse(t.Context(), devImport,
			api.DeleteSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		require.Empty(t, listImports(t, proj, "dev", "/"))
		require.Equal(t, http.StatusNotFound, listAt(t, tn.Admin, proj, "dev", reserved).StatusCode())
	})
}

func TestSecretReplication_Resync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a resync of an import that does not replicate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		importID := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"})

		// Action
		res := resync(t, tn.Admin, proj, "dev", importID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Import is not in replication mode", res.JSON400.Message)
	})

	t.Run("should refuse a resync after the plan loses secret approval, and keep the replica", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "value")
		devImport := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}, secretmanager.Replicated())
		waitReplicated(t, proj, "dev", "/", devImport, time.Time{})
		tn.SetPlan(t, license.Enterprise().Without(license.SecretApproval))

		// Action
		res := resync(t, tn.Admin, proj, "dev", devImport)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode(), "[LICENSE] today the resync is gated on the plan")
		require.Equal(t, planRestriction, res.JSON400.Message)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "KEY").Value)
	})
}

func TestSecretReplication_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a replication import when the plan does not include secret approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretApproval)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		body := api.CreateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev", IsReplication: new(true)}
		body.Import.Environment = "staging"
		body.Import.Path = "/"

		// Action
		res, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, planRestriction, res.JSON400.Message)
		require.Empty(t, listImports(t, proj, "dev", "/"))
	})
}

func resync(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, importID string) *api.ResyncSecretImportReplicationResponse {
	t.Helper()
	res, err := actor.API.ResyncSecretImportReplicationWithResponse(t.Context(), importID,
		api.ResyncSecretImportReplicationJSONRequestBody{ProjectId: proj.ID, Environment: env})
	require.NoError(t, err)
	return res
}

func listAt(t *testing.T, actor *harness.Principal, proj *fixture.Project, env, folderPath string) *api.ListSecretsV4Response {
	t.Helper()
	res, err := actor.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId: &proj.ID, Environment: &env, SecretPath: &folderPath,
	})
	require.NoError(t, err)
	return res
}

func openRequests(t *testing.T, proj *fixture.Project) int {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretApprovalRequestCountWithResponse(t.Context(),
		&api.GetSecretApprovalRequestCountParams{ProjectId: proj.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "counting requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	if res.JSON200.Approvals.Open == nil {
		return 0
	}
	return int(*res.JSON200.Approvals.Open)
}
