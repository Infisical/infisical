package history_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretVersion_PersonalOverride(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	const personalValue = "owner-personal-override-value"

	t.Run("should refuse another member reading the owner's override versions on every version route without leaking the value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared-value")
		override := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", personalValue, secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		dashboard, err := viewer.API.ListSecretVersionsWithResponse(t.Context(), override.ID, &api.ListSecretVersionsParams{Offset: 0, Limit: 20})
		require.NoError(t, err)
		value, err := viewer.API.GetSecretVersionValueWithResponse(t.Context(), override.ID, "1")
		require.NoError(t, err)
		byID, err := viewer.API.ListSecretVersionsByIdWithResponse(t.Context(), override.ID, &api.ListSecretVersionsByIdParams{Offset: 0, Limit: 20})
		require.NoError(t, err)

		// Assert
		for route, res := range map[string]struct {
			status int
			body   []byte
		}{
			"dashboard versions": {dashboard.StatusCode(), dashboard.Body},
			"dashboard value":    {value.StatusCode(), value.Body},
			"versions by id":     {byID.StatusCode(), byID.Body},
		} {
			require.Equalf(t, http.StatusForbidden, res.status, "%s returned %s", route, res.body)
			require.NotContainsf(t, string(res.body), personalValue, "%s leaked the override", route)
		}
		require.Equal(t, personalValue, versionValue(t, owner, override.ID, "1"))
	})

	t.Run("should let the owner read their own override version value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared-value")
		override := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", personalValue, secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		value := versionValue(t, owner, override.ID, "1")

		// Assert
		require.Equal(t, personalValue, value)
	})

	t.Run("should keep shared versions readable by another member", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		shared := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared-value")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", personalValue, secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		versions := versionsOf(t, viewer, shared.ID)

		// Assert
		require.Len(t, versions, 1)
		require.Equal(t, float32(1), versions[0].Version)
		require.Equal(t, "shared-value", versionValue(t, viewer, shared.ID, "1"))
	})
}
