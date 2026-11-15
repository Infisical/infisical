package insights_test

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

var projectInsights = map[string]func(context.Context, *api.ClientWithResponses, string) (int, []byte, error){
	"summary": func(ctx context.Context, c *api.ClientWithResponses, projectID string) (int, []byte, error) {
		res, err := c.GetInsightsSummaryWithResponse(ctx, projectID, &api.GetInsightsSummaryParams{})
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	},
	"counts": func(ctx context.Context, c *api.ClientWithResponses, projectID string) (int, []byte, error) {
		res, err := c.GetInsightsCountsWithResponse(ctx, projectID)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	},
	"secrets duplication": func(ctx context.Context, c *api.ClientWithResponses, projectID string) (int, []byte, error) {
		res, err := c.GetInsightsSecretsDuplicationWithResponse(ctx, projectID)
		if err != nil {
			return 0, nil, err
		}
		return res.StatusCode(), res.Body, nil
	},
}

func TestProjectInsights(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should count the project's secrets and folders, leaving out root folders and other projects", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "root")
		secretmanager.CreateSecret(t, proj, "dev", "APP_KEY", "app", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod")
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, other, "dev", "/elsewhere")
		secretmanager.CreateSecret(t, other, "dev", "OTHER_KEY", "other")

		// Action
		res, err := tn.Admin.API.GetInsightsCountsWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading counts returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, float32(3), res.JSON200.SecretCount)
		require.Equal(t, float32(1), res.JSON200.FolderCount)
		require.Zero(t, res.JSON200.DynamicSecretCount)
		require.Zero(t, res.JSON200.SecretRotationCount)
	})

	t.Run("should group secrets that share a value across environments and paths, leaving out reference values", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASSWORD", "shared-value")
		secretmanager.CreateSecret(t, proj, "prod", "DB_PASS", "shared-value", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "dev", "UNIQUE", "only-once")
		secretmanager.CreateSecret(t, proj, "dev", "REF_ONE", "${UNIQUE}")
		secretmanager.CreateSecret(t, proj, "dev", "REF_TWO", "${UNIQUE}")

		// Action
		res, err := tn.Admin.API.GetInsightsSecretsDuplicationWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading duplication returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.True(t, res.JSON200.SecretBlindIndexEnabled)
		require.Len(t, res.JSON200.Groups, 1)
		got := []string{}
		for _, s := range res.JSON200.Groups[0].Secrets {
			got = append(got, s.Environment.Slug+":"+s.SecretPath+":"+s.Key)
		}
		slices.Sort(got)
		require.Equal(t, []string{"dev:/:DB_PASSWORD", "prod:/app:DB_PASS"}, got)
	})

	t.Run("should answer every project insight for a viewer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))

		// Action + Assert
		for name, call := range projectInsights {
			status, body, err := call(t.Context(), viewer.API, proj.ID)
			require.NoError(t, err, name)
			require.Equalf(t, http.StatusOK, status, "%s answered %s", name, apierr.Body(body))
		}
	})

	t.Run("should refuse every project insight to a member with no access", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		blocked := proj.NewUser(t, fixture.WithPrincipalName("blocked"), fixture.WithRoles("no-access"))

		// Action + Assert
		for name, call := range projectInsights {
			status, body, err := call(t.Context(), blocked.API, proj.ID)
			require.NoError(t, err, name)
			require.Equalf(t, http.StatusForbidden, status, "%s answered %s", name, apierr.Body(body))
		}
	})

	t.Run("should refuse every project insight to an organization member outside the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := tn.NewUser(t, harness.WithName("outsider"))

		// Action + Assert
		for name, call := range projectInsights {
			status, body, err := call(t.Context(), outsider.API, proj.ID)
			require.NoError(t, err, name)
			require.Equalf(t, http.StatusForbidden, status, "%s answered %s", name, apierr.Body(body))
		}
	})

	t.Run("should refuse project insights when the plan does not include them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretAccessInsights)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action + Assert
		for name, call := range projectInsights {
			status, body, err := call(t.Context(), tn.Admin.API, proj.ID)
			require.NoError(t, err, name)
			require.Equalf(t, http.StatusBadRequest, status, "%s answered %s", name, apierr.Body(body))
			require.Equal(t, "Failed to access insights due to plan restriction. Upgrade your plan to access insights.",
				apierr.Message(body), name)
		}
	})
}

func TestProjectInsights_Validation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a stale secrets page size over 100", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.GetInsightsSummaryWithResponse(t.Context(), proj.ID,
			&api.GetInsightsSummaryParams{StaleSecretsLimit: new(float32(500))})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
	})

	t.Run("should refuse a negative stale secrets offset", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.GetInsightsSummaryWithResponse(t.Context(), proj.ID,
			&api.GetInsightsSummaryParams{StaleSecretsOffset: new(float32(-1))})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
	})
}
