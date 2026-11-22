package insights_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// The org-wide insights backed by Postgres. Access volume and auth methods read
// ClickHouse, which the harness does not run, and the client has no operation for them.
var orgInsights = map[string]func(context.Context, *api.ClientWithResponses) (int, error){
	"summary": func(ctx context.Context, c *api.ClientWithResponses) (int, error) {
		res, err := c.GetSecretsSummaryWithResponse(ctx)
		if err != nil {
			return 0, err
		}
		return res.StatusCode(), nil
	},
	"projects": func(ctx context.Context, c *api.ClientWithResponses) (int, error) {
		res, err := c.GetSecretsProjectsWithResponse(ctx, &api.GetSecretsProjectsParams{})
		if err != nil {
			return 0, err
		}
		return res.StatusCode(), nil
	},
	"static secrets usage": func(ctx context.Context, c *api.ClientWithResponses) (int, error) {
		res, err := c.GetStaticSecretsUsageWithResponse(ctx)
		if err != nil {
			return 0, err
		}
		return res.StatusCode(), nil
	},
	"search by value": func(ctx context.Context, c *api.ClientWithResponses) (int, error) {
		res, err := c.SearchOrgInsightsSecretsByValueWithResponse(ctx,
			api.SearchOrgInsightsSecretsByValueJSONRequestBody{SecretValue: "anything"})
		if err != nil {
			return 0, err
		}
		return res.StatusCode(), nil
	},
}

func TestOrgInsights(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer every org-wide insight for an organization admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action + Assert
		for name, call := range orgInsights {
			status, err := call(t.Context(), tn.Admin.API)
			require.NoError(t, err, name)
			require.Equal(t, http.StatusOK, status, name)
		}
	})

	t.Run("should refuse every org-wide insight without credentials", func(t *testing.T) {
		t.Parallel()

		// Setup
		anon := h.NewTenant(t).Anonymous(t)

		// Action + Assert
		for name, call := range orgInsights {
			status, err := call(t.Context(), anon)
			require.NoError(t, err, name)
			require.Equal(t, http.StatusUnauthorized, status, name)
		}
	})

	t.Run("should refuse insights when the plan does not include them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretAccessInsights)))

		// Action
		res, err := tn.Admin.API.SearchOrgInsightsSecretsByValueWithResponse(t.Context(),
			api.SearchOrgInsightsSecretsByValueJSONRequestBody{SecretValue: "anything"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to access insights due to plan restriction. Upgrade your plan to access insights.",
			res.JSON400.Message)
		summary, err := tn.Admin.API.GetSecretsSummaryWithResponse(t.Context())
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, summary.StatusCode())
	})
}

func TestOrgInsights_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an empty search value", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.SearchOrgInsightsSecretsByValueWithResponse(t.Context(),
			api.SearchOrgInsightsSecretsByValueJSONRequestBody{SecretValue: ""})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
	})

	t.Run("should refuse a project page size over 100", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetSecretsProjectsWithResponse(t.Context(), &api.GetSecretsProjectsParams{Limit: new(500)})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
	})

	t.Run("should refuse a negative project offset", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetSecretsProjectsWithResponse(t.Context(), &api.GetSecretsProjectsParams{Offset: new(-1)})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
	})
}
