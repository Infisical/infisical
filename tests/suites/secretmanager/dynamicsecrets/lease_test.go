package dynamicsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestDynamicSecretLease_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove the lease when it is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())
		l := ds.lease(t, nil, "")

		// Action
		res := ds.revoke(t, tn.Admin.API, l.ID, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, http.StatusNotFound, ds.getLease(t, l.ID, "/").StatusCode())
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should report failed deletion and keep the lease when the provider refuses an unforced revoke", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, postgresProvider(target))
		l := ds.lease(t, nil, "")
		username, _ := credentials(t, l)
		target.DropRole(t, username)

		// Action
		res := ds.revoke(t, tn.Admin.API, l.ID, false)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "Failed to delete", *res.JSON200.Lease.Status)
		require.Contains(t, *res.JSON200.Lease.StatusDetails, "does not exist")
		require.Equal(t, []string{l.ID}, ds.leaseIDs(t))
	})

	t.Run("should remove a lease the provider refuses to revoke when the revoke is forced", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, postgresProvider(target))
		l := ds.lease(t, nil, "")
		username, _ := credentials(t, l)
		target.DropRole(t, username)
		failed := ds.revoke(t, tn.Admin.API, l.ID, false)
		require.NotNil(t, failed.JSON200)
		require.Equal(t, "Failed to delete", *failed.JSON200.Lease.Status)

		// Action
		res := ds.revoke(t, tn.Admin.API, l.ID, true)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, http.StatusNotFound, ds.getLease(t, l.ID, "/").StatusCode())
		require.Empty(t, ds.leaseIDs(t))
	})
}

func TestDynamicSecretLease_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return not found and keep the lease when it is reached through another dynamic secret's folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/other")
		ds := newDynamicSecret(t, proj, totpProvider())
		other := newDynamicSecret(t, proj, totpProvider(), atPath("/other"))
		l := ds.lease(t, nil, "")

		// Action
		get := other.getLease(t, l.ID, "/other")
		revoke := other.revoke(t, tn.Admin.API, l.ID, false)

		// Assert
		requireStatus(t, http.StatusNotFound, get.StatusCode(), get.Body)
		requireStatus(t, http.StatusNotFound, revoke.StatusCode(), revoke.Body)
		require.Equal(t, []string{l.ID}, ds.leaseIDs(t))
	})

	t.Run("should list only the leases of the named dynamic secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())
		other := newDynamicSecret(t, proj, totpProvider())
		mine := ds.lease(t, nil, "")
		other.lease(t, nil, "")

		// Action
		got := ds.leaseIDs(t)

		// Assert
		require.Equal(t, []string{mine.ID}, got)
	})
}
