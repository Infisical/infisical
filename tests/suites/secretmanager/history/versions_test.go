package history_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSecretVersion_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the version list naming the commits permission when the role has secret read but no commits read", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "hunter2")
		proj.NewRole(t, "secret-reader", fixture.Permission{Subject: "secrets", Action: []string{"read"}})
		reader := proj.NewUser(t, fixture.WithPrincipalName("reader"), fixture.WithRoles("secret-reader"))

		// Action
		dashboard, err := reader.API.ListSecretVersionsWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsParams{Offset: 0, Limit: 10})
		require.NoError(t, err)
		byID, err := reader.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 10})
		require.NoError(t, err)

		// Assert
		for _, res := range []struct {
			status int
			body   []byte
		}{{dashboard.StatusCode(), dashboard.Body}, {byID.StatusCode(), byID.Body}} {
			requireStatus(t, http.StatusForbidden, res.status, res.body)
			require.Equal(t, "You do not have permission to read secret versions", apierr.Message(res.body))
			require.NotContains(t, string(res.body), "hunter2")
		}
	})

	t.Run("should hide version values without read-value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "hunter2")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "hunter3")
		proj.NewRole(t, "describer",
			fixture.Permission{Subject: "secrets", Action: []string{"describeSecret"}},
			fixture.Permission{Subject: "commits", Action: []string{"read"}})
		describer := proj.NewUser(t, fixture.WithPrincipalName("describer"), fixture.WithRoles("describer"))

		// Action
		res, err := describer.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 10})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing versions returned %d: %s", res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.SecretVersions, 2)
		for _, v := range res.JSON200.SecretVersions {
			require.True(t, v.SecretValueHidden)
			require.Equal(t, "<hidden-by-infisical>", v.SecretValue)
		}
		require.Equal(t, "<hidden-by-infisical>", versionValue(t, describer, secret.ID, "1"))
	})

	t.Run("should list versions newest first, with a limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secret := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "third")

		// Action
		res, err := tn.Admin.API.ListSecretVersionsByIdWithResponse(t.Context(), secret.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 2})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing versions returned %d: %s", res.StatusCode(), res.Body)
		got := map[float32]string{}
		order := []float32{}
		for _, v := range res.JSON200.SecretVersions {
			got[v.Version] = v.SecretValue
			order = append(order, v.Version)
		}
		require.Equal(t, []float32{3, 2}, order)
		require.Equal(t, map[float32]string{3: "third", 2: "second"}, got)
	})
}
