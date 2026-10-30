package secrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
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

	t.Run("should remove every user's override when the shared secret is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		alice := proj.NewUser(t, fixture.WithPrincipalName("alice"))
		bob := proj.NewUser(t, fixture.WithPrincipalName("bob"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "alice-only", secretmanager.As(alice), secretmanager.WithPersonal())
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "bob-only", secretmanager.As(bob), secretmanager.WithPersonal())

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "DB_PASS")

		// Assert
		for _, owner := range []*harness.Principal{alice, bob} {
			require.Emptyf(t, secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner), secretmanager.WithPersonal()),
				"%s still lists an override of the deleted secret", owner.Name)
			res, err := owner.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASS", &api.GetSecretByNameV4Params{
				ProjectId:   proj.ID,
				Environment: new("dev"),
				Type:        new(api.GetSecretByNameV4ParamsTypePersonal),
			})
			require.NoError(t, err)
			require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s still reads an override: %s", owner.Name, res.Body)
		}
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

	t.Run("should let a describe-only member create, update and delete their own override but not change the shared secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		describer := describeOnlyUser(t, proj, "describer")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(describer), secretmanager.WithPersonal())
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "mine-v2", secretmanager.As(describer), secretmanager.WithPersonal())
		secretmanager.DeleteSecret(t, proj, "dev", "DB_PASS", secretmanager.As(describer), secretmanager.WithPersonal())
		shared, err := describer.API.UpdateSecretV4WithResponse(t.Context(), "DB_PASS",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: new("hijacked")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, shared.StatusCode())
		require.Equal(t, "You are not allowed to edit on secrets", shared.JSON403.Message)
		require.Equal(t, "shared", secretmanager.GetSecret(t, proj, "dev", "DB_PASS").Value)
		res, err := describer.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASS", &api.GetSecretByNameV4Params{
			ProjectId: proj.ID, Environment: new("dev"), Type: new(api.GetSecretByNameV4ParamsTypePersonal),
		})
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode(), "the deleted override is still readable")
	})

	t.Run("should show the owner their override value even when they cannot read the shared value", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "an override is only ever readable by its owner, so the server unmasks it without read-value; the shared value stays hidden")

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		describer := describeOnlyUser(t, proj, "describer")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared-secret")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(describer), secretmanager.WithPersonal())

		// Action
		res, err := describer.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASS", &api.GetSecretByNameV4Params{
			ProjectId: proj.ID, Environment: new("dev"), Type: new(api.GetSecretByNameV4ParamsTypePersonal),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the override returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "mine", res.JSON200.Secret.SecretValue)
		require.NotContains(t, string(res.Body), "shared-secret")
	})

	t.Run("should refuse a machine identity deleting a personal secret and keep the shared secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("admin"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")

		// Action
		res, err := identity.API.DeleteSecretV4WithResponse(t.Context(), "DB_PASS", api.DeleteSecretV4JSONRequestBody{
			ProjectId:   proj.ID,
			Environment: "dev",
			Type:        new(api.DeleteSecretV4JSONBodyTypePersonal),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Must be user to delete personal secret", res.JSON400.Message)
		require.Equal(t, "shared", secretmanager.GetSecret(t, proj, "dev", "DB_PASS").Value)
	})

	t.Run("should return not found for a personal read when the owner has no override", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")

		// Action
		res, err := owner.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASS", &api.GetSecretByNameV4Params{
			ProjectId: proj.ID, Environment: new("dev"), Type: new(api.GetSecretByNameV4ParamsTypePersonal),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Secret with name 'DB_PASS' not found", res.JSON404.Message)
		require.NotContains(t, string(res.Body), "shared")
	})

	t.Run("should show the owner's override in place of the imported shared value when overrides are included", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "prod", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "prod", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"})

		// Action
		withOverrides := importedValues(t, owner, proj, api.ListSecretsV4ParamsIncludePersonalOverridesTrue)
		withoutOverrides := importedValues(t, owner, proj, api.ListSecretsV4ParamsIncludePersonalOverridesFalse)

		// Assert
		require.Equal(t, map[string]string{"DB_PASS": "mine"}, withOverrides)
		require.Equal(t, map[string]string{"DB_PASS": "shared"}, withoutOverrides)
	})
}

func importedValues(t *testing.T, pr *harness.Principal, proj *fixture.Project, overrides api.ListSecretsV4ParamsIncludePersonalOverrides) map[string]string {
	t.Helper()
	res, err := pr.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:                &proj.ID,
		Environment:              new("dev"),
		IncludeImports:           new(api.ListSecretsV4ParamsIncludeImportsTrue),
		IncludePersonalOverrides: &overrides,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.NotNil(t, res.JSON200.Imports)
	values := map[string]string{}
	for _, imp := range *res.JSON200.Imports {
		for _, s := range imp.Secrets {
			values[s.SecretKey] = s.SecretValue
		}
	}
	return values
}
