package permissions_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestRole_DescribeOnly(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	describeOnly := allow("secrets", "describeSecret")

	t.Run("should refuse the whole list with values for a describe-only role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		proj.NewRole(t, "describer", describeOnly)
		describer := proj.NewMachineIdentity(t, fixture.WithRoles("describer"))

		// Action
		got := listSecrets(t, describer, proj, "dev", "/", false)

		// Assert
		require.Equalf(t, http.StatusForbidden, got.status, "listing: %s", got.body)
		require.NotContains(t, string(got.body), "plaintext")
	})

	t.Run("should list a describe-only role's secrets on the dashboard with the values masked", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		proj.NewRole(t, "describer", describeOnly, allow("secret-imports", "read"))
		describer := proj.NewUser(t, fixture.WithRoles("describer"))

		// Action
		res, err := describer.API.ListProjectSecretsDetailsWithResponse(t.Context(),
			&api.ListProjectSecretsDetailsParams{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "dashboard listing returned %d: %s", res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON200.Secrets)
		require.Len(t, *res.JSON200.Secrets, 1)
		require.Equal(t, "API_KEY", (*res.JSON200.Secrets)[0].SecretKey)
		require.True(t, (*res.JSON200.Secrets)[0].SecretValueHidden)
		require.NotContains(t, string(res.Body), "plaintext")
	})

	t.Run("should silently leave out subfolder secrets without read-value from a recursive list", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/sub")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "root-value")
		secretmanager.CreateSecret(t, proj, "dev", "SUB_KEY", "sub-value", secretmanager.WithPath("/sub"))
		proj.NewRole(t, "root-values", describeOnly, allowWhere("secrets", map[string]any{"secretPath": "/"}, "readValue"))
		reader := proj.NewMachineIdentity(t, fixture.WithRoles("root-values"))

		// Action
		got := listSecrets(t, reader, proj, "dev", "/", true)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing recursively: %s", got.body)
		require.Equal(t, map[string]string{"ROOT_KEY": "root-value"}, got.values)
		require.Equal(t, http.StatusForbidden, listSecrets(t, reader, proj, "dev", "/sub", false).status,
			"the same secret refuses the list when its own folder is the one requested")
	})

	t.Run("should refuse get-by-name with the value and return it hidden without", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		proj.NewRole(t, "describer", describeOnly)
		describer := proj.NewMachineIdentity(t, fixture.WithRoles("describer"))

		// Action
		withValue := readSecret(t, describer, proj, "dev", "/", "API_KEY")
		withoutValue, err := describer.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY", &api.GetSecretByNameV4Params{
			ProjectId:       proj.ID,
			Environment:     new("dev"),
			ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValueFalse),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, withValue.StatusCode(), "reading with the value: %s", withValue.Body)
		require.NotContains(t, string(withValue.Body), "plaintext")
		require.NotNilf(t, withoutValue.JSON200, "reading without the value returned %d: %s", withoutValue.StatusCode(), withoutValue.Body)
		require.True(t, withoutValue.JSON200.Secret.SecretValueHidden)
		require.NotContains(t, string(withoutValue.Body), "plaintext")
	})

	t.Run("should refuse get-by-id for a describe-only role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		created := secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")
		proj.NewRole(t, "describer", describeOnly)
		describer := proj.NewMachineIdentity(t, fixture.WithRoles("describer"))

		// Action
		res, err := describer.API.GetSecretByIdV4WithResponse(t.Context(), created.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "reading by id: %s", res.Body)
		require.NotContains(t, string(res.Body), "plaintext")
	})
}
