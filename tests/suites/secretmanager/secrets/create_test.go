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

func TestSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back a created secret with its value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		created := secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "postgres://localhost/app")

		// Assert
		require.EqualValues(t, 1, created.Version, "a new secret starts at version 1")
		got := secretmanager.GetSecret(t, proj, "dev", "DB_URL")
		require.Equal(t, "postgres://localhost/app", got.Value)
		require.False(t, got.ValueHidden, "a hidden value is useless to anything downstream")
		require.Equal(t, "/", got.Path)
	})

	t.Run("should hold a separate value per environment when one name is created in two", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "dev-value")
		secretmanager.CreateSecret(t, proj, "prod", "API_KEY", "prod-value")

		// Assert
		require.Equal(t, "dev-value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
		require.Equal(t, "prod-value", secretmanager.GetSecret(t, proj, "prod", "API_KEY").Value)
	})

	t.Run("should refuse and keep the original when the same name is created twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "first")

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "TOKEN",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "dev",
				SecretPath:  new("/"),
				SecretValue: "second",
			})

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode(), "a duplicate create was allowed")
		require.Equal(t, "first", secretmanager.GetSecret(t, proj, "dev", "TOKEN").Value,
			"the refused create still changed the value")
	})

	t.Run("should refuse a secret when the environment does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "STRAY",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "nope",
				SecretPath:  new("/"),
				SecretValue: "value",
			})

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode(), "a secret was created in an environment that does not exist")
	})

	t.Run("should refuse a write when the project belongs to another tenant", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		target := fixture.NewProject(t, theirs, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := mine.Admin.API.CreateSecretV4WithResponse(t.Context(), "STOLEN",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   target.ID,
				Environment: "dev",
				SecretPath:  new("/"),
				SecretValue: "value",
			})

		// Assert
		require.NoError(t, err)
		require.NotEqualf(t, http.StatusOK, res.StatusCode(),
			"tenant %s wrote a secret into tenant %s's project", mine.OrgSlug, theirs.OrgSlug)
	})
}
