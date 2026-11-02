package events_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestProjectEvents_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	subscribeTo := func(action string, conditions map[string]any) fixture.Permission {
		return fixture.Permission{Subject: "secret-event-subscriptions", Action: []string{action}, Conditions: conditions}
	}

	t.Run("should refuse when the plan does not include event subscriptions", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.EventSubscriptions)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res := trySubscribe(t, tn.Admin, proj, on("secret:create"))

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "Event subscriptions are not available on your current plan. Please upgrade to access this feature.",
			apierr.Message(res.Body))
	})

	t.Run("should refuse the whole subscription when the role does not allow one of its event types", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "create-only", subscribeTo("subscribe-to-creation-events", nil))
		subscriber := proj.NewMachineIdentity(t, fixture.WithRoles("create-only"))

		// Action
		res := trySubscribe(t, subscriber, proj, on("secret:create"), on("secret:delete"))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not allowed to subscribe-to-deletion-events on secret-event-subscriptions",
			apierr.Message(res.Body))
		subscribe(t, subscriber, proj, on("secret:create"))
	})

	t.Run("should refuse a subscription to every environment when the role allows only one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "dev-only", subscribeTo("subscribe-to-creation-events",
			map[string]any{"environment": map[string]any{"$eq": "dev"}}))
		subscriber := proj.NewMachineIdentity(t, fixture.WithRoles("dev-only"))

		// Action
		res := trySubscribe(t, subscriber, proj, on("secret:create"))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "body: %s", apierr.Body(res.Body))
		subscribe(t, subscriber, proj, on("secret:create").in("dev", "/"))
	})

	t.Run("should not stream a change in a folder the role denies", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/payroll")
		denied := subscribeTo("subscribe-to-creation-events", map[string]any{"secretPath": map[string]any{"$eq": "/payroll"}})
		denied.Inverted = true
		proj.NewRole(t, "no-payroll", subscribeTo("subscribe-to-creation-events", nil), denied)
		s := subscribe(t, proj.NewMachineIdentity(t, fixture.WithRoles("no-payroll")), proj, on("secret:create"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "SALARY", "value", secretmanager.WithPath("/payroll"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")

		// Assert
		require.Equal(t, []secretRef{{"dev", "/", "API_KEY"}}, s.next(t).secrets(t))
	})

	t.Run("should refuse another organization's project without revealing it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := h.NewTenant(t).Admin

		// Action
		res := trySubscribe(t, outsider, proj, on("secret:create"))

		// Assert
		require.GreaterOrEqualf(t, res.StatusCode(), 400, "body: %s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), proj.Name)
	})
}
