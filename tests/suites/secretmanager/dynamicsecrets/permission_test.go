package dynamicsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestDynamicSecretLease_Permission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a lease to a viewer and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		ds := newDynamicSecret(t, proj, totpProvider())

		// Action
		res := ds.requestLease(t, viewer.API, "")

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should lease only the dynamic secrets whose metadata the role's condition matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "payments-lease", fixture.Permission{
			Subject: "dynamic-secrets",
			Action:  []string{"lease"},
			Conditions: map[string]any{"metadata": map[string]any{"$elemMatch": map[string]any{
				"key": map[string]any{"$eq": "team"}, "value": map[string]any{"$eq": "payments"},
			}}},
		})
		member := proj.NewMachineIdentity(t, fixture.WithRoles("payments-lease"))
		payments := newDynamicSecret(t, proj, totpProvider(), withMetadata("team", "payments"))
		growth := newDynamicSecret(t, proj, totpProvider(), withMetadata("team", "growth"))

		// Action
		allowed := payments.requestLease(t, member.API, "")
		refused := growth.requestLease(t, member.API, "")

		// Assert
		requireStatus(t, http.StatusOK, allowed.StatusCode(), allowed.Body)
		requireStatus(t, http.StatusForbidden, refused.StatusCode(), refused.Body)
		require.Empty(t, growth.leaseIDs(t))
	})
}

func TestDynamicSecret_License(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse create and lease when the plan does not include dynamic secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())
		tn.SetPlan(t, license.Enterprise().Without(license.DynamicSecret))

		// Action
		created, _ := createDynamicSecret(t, tn.Admin.API, proj, totpProvider())
		leased := ds.requestLease(t, tn.Admin.API, "")

		// Assert
		requireStatus(t, http.StatusBadRequest, created.StatusCode(), created.Body)
		require.Contains(t, apierr.Body(created.Body), "plan restriction")
		requireStatus(t, http.StatusBadRequest, leased.StatusCode(), leased.Body)
		require.Contains(t, apierr.Body(leased.Body), "plan restriction")
		require.Equal(t, []string{ds.Name}, names(t, proj, "/"))
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should still list, revoke and delete when the plan does not include dynamic secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())
		l := ds.lease(t, nil, "")
		tn.SetPlan(t, license.Enterprise().Without(license.DynamicSecret))

		// Action
		listed := names(t, proj, "/")
		revoked := ds.revoke(t, tn.Admin.API, l.ID, false)
		deleted := ds.delete(t, false)

		// Assert
		require.Equal(t, []string{ds.Name}, listed)
		requireStatus(t, http.StatusOK, revoked.StatusCode(), revoked.Body)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)
		require.Equal(t, http.StatusNotFound, ds.get(t, tn.Admin.API).StatusCode())
	})
}
