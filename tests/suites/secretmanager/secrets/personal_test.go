package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecret_PersonalOverride(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an override when no shared secret has that name", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))

		// Action
		res, err := owner.API.CreateSecretV4WithResponse(t.Context(), "DB_PASS", api.CreateSecretV4JSONRequestBody{
			ProjectId:   proj.ID,
			Environment: "dev",
			SecretValue: "mine",
			Type:        new(api.CreateSecretV4JSONBodyTypePersonal),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to create personal secret override for no corresponding shared secret", res.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner), secretmanager.WithPersonal()))
	})

	t.Run("should show the owner their override only when overrides are included", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())

		// Assert
		withOverrides := secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner), secretmanager.WithPersonal())
		require.Len(t, withOverrides, 1)
		require.Equal(t, "mine", withOverrides[0].Value)
		withoutOverrides := secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner))
		require.Len(t, withoutOverrides, 1)
		require.Equal(t, "shared", withoutOverrides[0].Value)
	})

	t.Run("should show another member only the shared value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		other := proj.NewUser(t, fixture.WithPrincipalName("other"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		seen := secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(other), secretmanager.WithPersonal())

		// Assert
		require.Len(t, seen, 1)
		require.Equal(t, "shared", seen[0].Value)
	})

	t.Run("should keep the shared secret when the override is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "DB_PASS", secretmanager.As(owner), secretmanager.WithPersonal())

		// Assert
		seen := secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner), secretmanager.WithPersonal())
		require.Len(t, seen, 1)
		require.Equal(t, "shared", seen[0].Value)
	})

	t.Run("should refuse an override from a machine identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")

		// Action
		res, err := identity.API.CreateSecretV4WithResponse(t.Context(), "DB_PASS", api.CreateSecretV4JSONRequestBody{
			ProjectId:   proj.ID,
			Environment: "dev",
			SecretValue: "mine",
			Type:        new(api.CreateSecretV4JSONBodyTypePersonal),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Must be user to create personal secret", res.JSON400.Message)
		require.Equal(t, "shared", secretmanager.GetSecret(t, proj, "dev", "DB_PASS").Value)
	})

	t.Run("should refuse renaming an override and keep its name", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		res, err := owner.API.UpdateSecretV4WithResponse(t.Context(), "DB_PASS", api.UpdateSecretV4JSONRequestBody{
			ProjectId:     proj.ID,
			Environment:   "dev",
			Type:          new(api.UpdateSecretV4JSONBodyTypePersonal),
			NewSecretName: new("RENAMED"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Personal secret cannot change the key name", res.JSON400.Message)
		require.Equal(t, "mine", secretmanager.GetSecret(t, proj, "dev", "DB_PASS", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
	})
}
