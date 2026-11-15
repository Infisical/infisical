package validation_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretValidationRule_Enforce(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a value under the minimum or over the maximum length, quoting the lengths", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "length-window", onValues(valueConstraints{MinLength: new(4), MaxLength: new(8)}))

		// Action
		short := createSecret(t, tn.Admin, proj, "dev", "/", "SHORT", "abc")
		long := createSecret(t, tn.Admin, proj, "dev", "/", "LONG", "123456789")

		// Assert
		require.Equal(t, http.StatusBadRequest, short.StatusCode())
		require.Equal(t, "Secret validation failed:\n"+
			`Secret "SHORT": value must be at least 4 characters (got 3) (rule: "length-window", constraint: Minimum length)`,
			short.JSON400.Message)
		require.Equal(t, http.StatusBadRequest, long.StatusCode())
		require.Equal(t, "Secret validation failed:\n"+
			`Secret "LONG": value must be at most 8 characters (got 9) (rule: "length-window", constraint: Maximum length)`,
			long.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse a value that breaks the rule's regex", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "lowercase", onValues(valueConstraints{RegexPattern: new("^[a-z]+$")}))

		// Action
		res := createSecret(t, tn.Admin, proj, "dev", "/", "TOKEN", "Not-Lowercase")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "TOKEN": value must match pattern ^[a-z]+$ (rule: "lowercase", constraint: Regex pattern)`)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse a value without the required prefix or suffix, naming both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "affixes", onValues(valueConstraints{RequiredPrefix: new("sk_"), RequiredSuffix: new("_end")}))

		// Action
		res := createSecret(t, tn.Admin, proj, "dev", "/", "STRIPE_KEY", "plain")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `value must start with "sk_" (rule: "affixes", constraint: Required prefix)`)
		require.Contains(t, res.JSON400.Message, `value must end with "_end" (rule: "affixes", constraint: Required suffix)`)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse reusing any of the last N values and keep the current one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "no-reuse", onValues(valueConstraints{UniqueAcrossLastVersions: new(2)}))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASSWORD", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASSWORD", "second")

		// Action
		res := updateSecret(t, tn.Admin, proj, "dev", "DB_PASSWORD", "first")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message,
			`Secret "DB_PASSWORD": value cannot reuse any of the last 2 values (rule: "no-reuse", constraint: Prevent reuse of previous secret values)`)
		require.Equal(t, "second", secretmanager.GetSecret(t, proj, "dev", "DB_PASSWORD").Value)
	})

	t.Run("should not enforce an inactive rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "dormant", inactive(), onValues(valueConstraints{MinLength: new(20)}))

		// Action
		res := createSecret(t, tn.Admin, proj, "dev", "/", "SHORT", "abc")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)
		require.Equal(t, "abc", secretmanager.GetSecret(t, proj, "dev", "SHORT").Value)
	})

	t.Run("should refuse the whole batch create when one secret breaks the rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "app-prefix", onKeys(keyConstraints{RequiredPrefix: new("APP_")}))
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "APP_NAME", "a"
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "STRAY", "b"

		// Action
		res, err := tn.Admin.API.CreateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "STRAY": key must start with "APP_" (rule: "app-prefix", constraint: Required prefix)`)
		require.NotContains(t, res.JSON400.Message, `Secret "APP_NAME"`)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse a rename in a batch update when the new key breaks the rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "APP_NAME", "a")
		newRule(t, proj, "app-prefix", onKeys(keyConstraints{RequiredPrefix: new("APP_")}))
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 1)[:1]
		body.Secrets[0].SecretKey, body.Secrets[0].NewSecretName = "APP_NAME", new("NAME")

		// Action
		res, err := tn.Admin.API.UpdateManySecretsV4WithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "NAME": key must start with "APP_" (rule: "app-prefix", constraint: Required prefix)`)
		keys := []string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev") {
			keys = append(keys, s.Key)
		}
		require.Equal(t, []string{"APP_NAME"}, keys)
	})

	t.Run("should validate the expanded value of a reference, not the reference itself", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "BASE", "ab")
		newRule(t, proj, "min-five", onValues(valueConstraints{MinLength: new(5)}))

		// Action
		res := createSecret(t, tn.Admin, proj, "dev", "/", "REF", "${staging.BASE}")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "REF": value must be at least 5 characters (got 2)`)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should name where a duplicated value is held only to a writer who may describe that location", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/hidden")
		secretmanager.CreateSecret(t, proj, "dev", "ORIGINAL", "duplicated", secretmanager.WithPath("/hidden"))
		newRule(t, proj, "unique-in-dev", atPath("/**"), onValues(valueConstraints{UniqueWithinScope: new(true)}))
		proj.NewRole(t, "root-writer", fixture.Permission{
			Subject:    "secrets",
			Action:     []string{"describeSecret", "readValue", "create"},
			Conditions: map[string]any{"environment": map[string]any{"$eq": "dev"}, "secretPath": map[string]any{"$eq": "/"}},
		})
		writer := proj.NewMachineIdentity(t, fixture.WithRoles("root-writer"))

		// Action
		restricted := createSecret(t, writer, proj, "dev", "/", "COPY", "duplicated")
		admin := createSecret(t, tn.Admin, proj, "dev", "/", "COPY", "duplicated")

		// Assert
		require.Equal(t, http.StatusBadRequest, restricted.StatusCode())
		require.Contains(t, restricted.JSON400.Message, `Secret "COPY": value is already used by another secret in this project`)
		require.NotContains(t, restricted.JSON400.Message, "ORIGINAL")
		require.NotContains(t, restricted.JSON400.Message, "/hidden")
		require.Equal(t, http.StatusBadRequest, admin.StatusCode())
		require.Contains(t, admin.JSON400.Message,
			`Secret "COPY": value is already used by secret "ORIGINAL" in environment "dev" at path "/hidden"`)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})
}
