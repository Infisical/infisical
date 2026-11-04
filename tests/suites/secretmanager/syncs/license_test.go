package syncs_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

const enterpriseSyncRefusal = "Failed to create secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."

func TestSecretSync_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a create past the plan's sync limit and keep the syncs there are", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.SecretSyncLimit, 1)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		newSync(t, proj, conn, repoScope("acme", "app"), withName("only"))

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "other"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to create secret sync due to plan limit reached. Upgrade plan to add more secret syncs.", message(res.Body))
		require.Equal(t, []string{"only"}, listSyncNames(t, tn.Admin.API, proj))
	})

	t.Run("should refuse a Chef sync when the plan does not include enterprise syncs", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The plan is checked before the connection is looked at, so the refusal needs
			no Chef connection. A GitHub one stands in.`)

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.EnterpriseSecretSyncs)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)

		// Action
		res, err := tn.Admin.API.CreateChefSecretSyncWithResponse(t.Context(), chefSyncBody(proj, conn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, enterpriseSyncRefusal, message(res.Body))
	})

	t.Run("should refuse an OCI Vault sync when the plan does not include enterprise syncs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.EnterpriseSecretSyncs)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)

		// Action
		res, err := tn.Admin.API.CreateOciVaultSecretSyncWithResponse(t.Context(), ociVaultSyncBody(proj, conn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, enterpriseSyncRefusal, message(res.Body))
	})

	t.Run("should pass the plan check and refuse the connection when the plan includes enterprise syncs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)

		// Action
		res, err := tn.Admin.API.CreateChefSecretSyncWithResponse(t.Context(), chefSyncBody(proj, conn))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, fmt.Sprintf("GitHub Connection with ID %s cannot be used to connect to Chef", conn.ID), message(res.Body))
	})
}

func chefSyncBody(p *fixture.Project, conn *fixture.AppConnection) api.CreateChefSecretSyncJSONRequestBody {
	body := api.CreateChefSecretSyncJSONRequestBody{
		Name:         "chef",
		ProjectId:    p.ID,
		ConnectionId: conn.ID,
		Environment:  "dev",
		SecretPath:   "/",
	}
	body.DestinationConfig.DataBagName = "app"
	body.DestinationConfig.DataBagItemName = "secrets"
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	return body
}

func ociVaultSyncBody(p *fixture.Project, conn *fixture.AppConnection) api.CreateOciVaultSecretSyncJSONRequestBody {
	body := api.CreateOciVaultSecretSyncJSONRequestBody{
		Name:         "oci-vault",
		ProjectId:    p.ID,
		ConnectionId: conn.ID,
		Environment:  "dev",
		SecretPath:   "/",
	}
	body.DestinationConfig.CompartmentOcid = "ocid1.compartment.oc1..aaaa"
	body.DestinationConfig.VaultOcid = "ocid1.vault.oc1..aaaa"
	body.DestinationConfig.KeyOcid = "ocid1.key.oc1..aaaa"
	body.SyncOptions.InitialSyncBehavior = "overwrite-destination"
	return body
}
