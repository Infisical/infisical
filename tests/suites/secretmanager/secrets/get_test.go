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

func TestSecret_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the earlier value when an earlier version is requested", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "API_KEY", "second")

		// Action
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev"), Version: new(float32(1))})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading version 1 returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "first", res.JSON200.Secret.SecretValue)
		require.EqualValues(t, 1, res.JSON200.Secret.Version)
	})

	t.Run("should hide the value when the caller asks not to see it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext")

		// Action
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
			&api.GetSecretByNameV4Params{
				ProjectId:       proj.ID,
				Environment:     new("dev"),
				ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValueFalse),
			})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading returned %d: %s", res.StatusCode(), res.Body)
		require.True(t, res.JSON200.Secret.SecretValueHidden)
		require.NotContains(t, string(res.Body), "plaintext")
	})

	t.Run("should return not found when the secret does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "NOPE",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Secret with name 'NOPE' not found", res.JSON404.Message)
	})

	t.Run("should return the same secret by id as by name, with its path", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		created := secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "postgres://app", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.GetSecretByIdV4WithResponse(t.Context(), created.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading by id returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "DB_URL", res.JSON200.Secret.SecretKey)
		require.Equal(t, "postgres://app", res.JSON200.Secret.SecretValue)
		require.Equal(t, "/app", res.JSON200.Secret.SecretPath)
	})

	t.Run("should refuse and reveal nothing for a secret id from another tenant's project", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		target := fixture.NewProject(t, theirs, fixture.WithProjectType("secret-manager"))
		created := secretmanager.CreateSecret(t, target, "dev", "THEIRS", "their-value")

		// Action
		res, err := mine.Admin.API.GetSecretByIdV4WithResponse(t.Context(), created.ID)

		// Assert
		require.NoError(t, err)
		require.NotEqualf(t, http.StatusOK, res.StatusCode(),
			"tenant %s read a secret from tenant %s's project", mine.OrgSlug, theirs.OrgSlug)
		require.NotContains(t, string(res.Body), "their-value")
	})

	t.Run("should refuse another member reading the owner's personal override by id", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		other := proj.NewUser(t, fixture.WithPrincipalName("other"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		personal := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "owner-only",
			secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		res, err := other.API.GetSecretByIdV4WithResponse(t.Context(), personal.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to access this secret", res.JSON403.Message)
		require.NotContains(t, string(res.Body), "owner-only")
	})
}
