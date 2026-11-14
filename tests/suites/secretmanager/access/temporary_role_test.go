package access_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestTemporaryRole_Assign(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an identity membership with no permanent role and keep the old roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res := setIdentityRoles(t, proj, identity, temporary("admin", time.Now(), "1h"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Identity must have at least one permanent role", res.JSON400.Message)
		require.Equal(t, []string{"viewer"}, slugs(identityRoles(t, proj, identity)))
	})

	t.Run("should refuse a user membership with no permanent role and keep the old roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		user := proj.NewUser(t, fixture.WithRoles("viewer"))

		// Action
		res := setUserRoles(t, proj, tn.Admin, user, temporary("admin", time.Now(), "1h"))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, string(res.Body), "At least one long lived role is required")
		require.Equal(t, []string{"viewer"}, slugs(userRoles(t, proj, user)))
	})

	t.Run("should refuse a temporary role without a start time and range and keep the old roles", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res := setIdentityRoles(t, proj, identity, permanent("viewer"), roleEntry{Role: "admin", IsTemporary: true})

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Equal(t, []string{"viewer"}, slugs(identityRoles(t, proj, identity)))
	})

	t.Run("should refuse a temporary role when the plan sets temporary access to false", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretsTemporaryAccess)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res := setIdentityRoles(t, proj, identity, permanent("viewer"), temporary("admin", time.Now(), "1h"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Temporary access is not available on your current plan. Please upgrade to continue.", res.JSON400.Message)
		require.Equal(t, []string{"viewer"}, slugs(identityRoles(t, proj, identity)))
	})
}

func TestTemporaryRole_Expiry(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give no access from an expired temporary admin role while the permanent viewer role still applies", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		res := setIdentityRoles(t, proj, identity, permanent("viewer"), temporary("admin", time.Now().Add(-2*time.Hour), "1h"))
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Action
		created := createSecret(t, identity.API, proj, "dev", "/", "NEW", "value")

		// Assert
		require.Equal(t, http.StatusForbidden, created.StatusCode())
		listed := listSecrets(t, identity.API, proj, "dev", "/")
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Equal(t, []string{"EXISTING"}, keysOf(listed))
	})

	t.Run("should grant access from an active temporary role", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		res := setIdentityRoles(t, proj, identity, permanent("viewer"), temporary("admin", time.Now().Add(-time.Minute), "1h"))
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Action
		created := createSecret(t, identity.API, proj, "dev", "/", "NEW", "value")

		// Assert
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "NEW").Value)
	})

	t.Run("should leave an expired role out of the permissions response while the membership list still shows it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		user := proj.NewUser(t, fixture.WithRoles("viewer"))
		res := setUserRoles(t, proj, tn.Admin, user, permanent("viewer"), temporary("admin", time.Now().Add(-2*time.Hour), "1h"))
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)

		// Action
		perms, err := user.API.GetProjectPermissionsV1WithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, perms.StatusCode(), perms.Body)
		require.Len(t, perms.JSON200.Data.Memberships, 1)
		var active []string
		for _, r := range perms.JSON200.Data.Memberships[0].Roles {
			active = append(active, r.Role)
		}
		require.Equal(t, []string{"viewer"}, active)

		listed := userRoles(t, proj, user)
		require.ElementsMatch(t, []string{"viewer", "admin"}, slugs(listed))
		for _, r := range listed {
			if r.Slug == "admin" {
				require.True(t, r.Temporary)
				require.NotNil(t, r.EndsAt)
				require.True(t, r.EndsAt.Before(time.Now()), "the listed admin role should carry its past end time")
			}
		}
	})
}
