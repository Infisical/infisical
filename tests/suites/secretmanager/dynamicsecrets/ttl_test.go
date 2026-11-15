package dynamicsecrets_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestDynamicSecret_TTL(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, tc := range []struct{ ttl, message string }{
		{"30s", "greater than 1min"},
		{"11y", "less than 10 years"},
	} {
		t.Run("should refuse a default ttl of "+tc.ttl, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

			// Action
			res, _ := createDynamicSecret(t, tn.Admin.API, proj, totpProvider(), defaultTTL(tc.ttl))

			// Assert
			require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
			require.Contains(t, apierr.Body(res.Body), tc.message)
			require.Empty(t, names(t, proj, "/"))
		})
	}

	t.Run("should accept a default ttl over the max ttl and then refuse a lease at that default", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, cfg := createDynamicSecret(t, tn.Admin.API, proj, totpProvider(), defaultTTL("2h"), maxTTL("1h"))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		ds := &dynamicSecret{Name: cfg.name, env: cfg.env, path: cfg.path, proj: proj}
		lres := ds.requestLease(t, tn.Admin.API, "")
		requireStatus(t, http.StatusBadRequest, lres.StatusCode(), lres.Body)
		require.Contains(t, apierr.Body(lres.Body), "TTL cannot be larger than max TTL")
	})
}

func TestDynamicSecretLease_TTL(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should expire at the default ttl when the lease names none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider(), defaultTTL("2h"))

		// Action
		l := ds.lease(t, nil, "")

		// Assert
		require.WithinDuration(t, l.CreatedAt.Add(2*time.Hour), l.ExpireAt, time.Minute)
	})

	t.Run("should refuse a lease under a minute and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())

		// Action
		res := ds.requestLease(t, tn.Admin.API, "30s")

		// Assert
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "greater than 1min")
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should refuse a lease over the max ttl and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider(), maxTTL("1h"))

		// Action
		res := ds.requestLease(t, tn.Admin.API, "2h")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "TTL cannot be larger than max TTL")
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should answer 500 and create no lease when the ttl is not a duration", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())

		// Action
		res := ds.requestLease(t, tn.Admin.API, "abc")

		// Assert
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Empty(t, ds.leaseIDs(t))
	})

	t.Run("should push the expiry out by the ttl when a lease is renewed within the max ttl", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider(), maxTTL("2h"))
		l := ds.lease(t, nil, "1h")

		// Action
		res := ds.renew(t, l.ID, "30m")

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.WithinDuration(t, l.ExpireAt.Add(30*time.Minute), res.JSON200.Lease.ExpireAt, time.Second)
	})

	t.Run("should refuse and keep the expiry when a renewal would pass the max ttl from creation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider(), maxTTL("2h"))
		l := ds.lease(t, nil, "1h")

		// Action
		res := ds.renew(t, l.ID, "90m")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "exceed the maximum allowed lease duration")
		got := ds.getLease(t, l.ID, "/")
		require.NotNil(t, got.JSON200)
		require.True(t, l.ExpireAt.Equal(got.JSON200.Lease.ExpireAt), "the expiry moved: %v -> %v", l.ExpireAt, got.JSON200.Lease.ExpireAt)
	})
}
