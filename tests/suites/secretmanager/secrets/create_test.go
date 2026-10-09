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

	t.Run("should place the secret in the nested folder and not at the root when a path is given", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "nested", secretmanager.WithPath("/app/api"))

		// Assert
		require.Equal(t, "nested", secretmanager.GetSecret(t, proj, "dev", "DB_URL", secretmanager.WithPath("/app/api")).Value)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"), "the nested secret also landed at the root")
	})

	t.Run("should refuse and create nothing when the folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "STRAY",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "dev",
				SecretPath:  new("/missing"),
				SecretValue: "value",
			})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Folder with path '/missing' in environment with slug 'dev' not found", res.JSON404.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should keep a trailing newline and trim the rest of the surrounding whitespace", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "PEM", "  -----BEGIN KEY-----\n")
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "  padded  ")

		// Assert
		require.Equal(t, "-----BEGIN KEY-----\n", secretmanager.GetSecret(t, proj, "dev", "PEM").Value)
		require.Equal(t, "padded", secretmanager.GetSecret(t, proj, "dev", "TOKEN").Value)
	})

	t.Run("should return the tags and metadata the secret was created with", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		tagID := newTag(t, proj, "billing")

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "STRIPE_KEY",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:      proj.ID,
				Environment:    "dev",
				SecretValue:    "sk_test",
				TagIds:         &[]string{tagID},
				SecretMetadata: &[]secretMetadataEntry{{Key: "team", Value: new("payments")}},
			})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)

		// Assert
		got, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "STRIPE_KEY",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading returned %d: %s", got.StatusCode(), got.Body)
		require.NotNil(t, got.JSON200.Secret.Tags)
		require.Len(t, *got.JSON200.Secret.Tags, 1)
		require.Equal(t, "billing", (*got.JSON200.Secret.Tags)[0].Slug)
		require.NotNil(t, got.JSON200.Secret.SecretMetadata)
		require.Len(t, *got.JSON200.Secret.SecretMetadata, 1)
		require.Equal(t, "team", (*got.JSON200.Secret.SecretMetadata)[0].Key)
	})

	t.Run("should refuse and create nothing when the tag belongs to another project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		foreignTagID := newTag(t, other, "foreign")

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "TAGGED",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "dev",
				SecretValue: "value",
				TagIds:      &[]string{foreignTagID},
			})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Contains(t, res.JSON404.Message, "Tag not found")
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse and create nothing when the actor is a project viewer", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.CreateSecretV4WithResponse(t.Context(), "BLOCKED",
			api.CreateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", SecretValue: "value"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on secrets", res.JSON403.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should let a machine identity with the member role create and read a secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "CI_TOKEN", "from-ci", secretmanager.As(member))

		// Assert
		require.Equal(t, "from-ci", secretmanager.GetSecret(t, proj, "dev", "CI_TOKEN", secretmanager.As(member)).Value)
	})
}
