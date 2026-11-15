package dynamicsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestDynamicSecret_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the dynamic secret at once when it has no leases", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())

		// Action
		res := ds.delete(t, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, http.StatusNotFound, ds.get(t, tn.Admin.API).StatusCode())
	})

	t.Run("should revoke every lease at the provider and then remove the dynamic secret when it has leases", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, postgresProvider(target))
		first, _ := credentials(t, ds.lease(t, nil, ""))
		second, _ := credentials(t, ds.lease(t, nil, ""))
		target.DropRoleAtCleanup(t, first)
		target.DropRoleAtCleanup(t, second)

		// Action
		res := ds.delete(t, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "Revocation in process", *res.JSON200.DynamicSecret.Status)
		wait.Until(t, "the dynamic secret to be removed", func() bool {
			return ds.get(t, tn.Admin.API).StatusCode() == http.StatusNotFound
		})
		require.False(t, target.RoleExists(t, first), "the first lease's role is still on the database")
		require.False(t, target.RoleExists(t, second), "the second lease's role is still on the database")
	})

	t.Run("should remove the dynamic secret at once and leave the leased roles when the delete is forced", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, postgresProvider(target))
		username, password := credentials(t, ds.lease(t, nil, ""))
		target.DropRoleAtCleanup(t, username)

		// Action
		res := ds.delete(t, true)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, http.StatusNotFound, ds.get(t, tn.Admin.API).StatusCode())
		require.NoError(t, target.Login(t, username, password), "a forced delete revoked the lease at the provider")
	})
}
