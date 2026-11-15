package validation_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretValidationRule_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse and create nothing when the rule sets no constraint", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "empty", onValues(valueConstraints{})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), "A rule must set at least one key or value constraint")
		require.Empty(t, ruleNames(t, proj))
	})

	t.Run("should refuse and create nothing when the minimum length is greater than the maximum", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "inverted", onValues(valueConstraints{MinLength: new(10), MaxLength: new(5)})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), "Minimum length (10) cannot be greater than maximum length (5)")
		require.Empty(t, ruleNames(t, proj))
	})

	t.Run("should refuse and create nothing when the regex is invalid", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "broken-regex", onValues(valueConstraints{RegexPattern: new("([a-z")})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), "Must be a valid regular expression")
		require.Empty(t, ruleNames(t, proj))
	})

	t.Run("should refuse a rule that constrains the same field over an overlapping scope and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "first", atPath("/**"), onValues(valueConstraints{MinLength: new(4)}))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "second", atPath("/app"), onValues(valueConstraints{MinLength: new(8)})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, `Rule "first" already constrains value.minLength over the same secrets. `+
			"Change the environment, the secret path, or the constraints so the two rules do not overlap.", res.JSON400.Message)
		require.Equal(t, []string{"first"}, ruleNames(t, proj))
	})

	t.Run("should accept a rule over an overlapping scope when it constrains a different field", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		newRule(t, proj, "first", atPath("/**"), onValues(valueConstraints{MinLength: new(4)}))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "second", atPath("/app"), onValues(valueConstraints{MaxLength: new(8)})))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)
		require.ElementsMatch(t, []string{"first", "second"}, ruleNames(t, proj))
	})

	t.Run("should refuse and create nothing when the environment does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateStaticSecretsValidationRuleWithResponse(t.Context(),
			ruleBody(proj, "nowhere", inEnv("nope"), onValues(valueConstraints{MinLength: new(4)})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, fmt.Sprintf("Environment 'nope' not found in project with ID '%s'", proj.ID), res.JSON404.Message)
		require.Empty(t, ruleNames(t, proj))
	})
}
