package discovery_test

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestPkiDiscovery_Scan(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record the certificate a name serves, as discovered, at an installation for that name and port", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		discovery := newDiscovery(t, tn, proj, "443", name)

		// Action
		got := scanned(t, tn, discovery)

		// Assert
		require.Equal(t, "completed", got.JSON200.Status)
		require.NotNil(t, got.JSON200.CertificatesFoundCount)
		require.Equal(t, float32(1), *got.JSON200.CertificatesFoundCount)
		found := installationsNamed(t, tn, proj, name)
		require.Len(t, found, 1)
		require.EqualValues(t, 443, found[0].Details["port"])
		certs := certificatesAt(t, tn, found[0].ID)
		require.Len(t, certs, 1)
		require.Equal(t, name, certs[0].CommonName)
		cert, err := tn.Admin.API.GetCertificateWithResponse(t.Context(), certs[0].ID, nil)
		require.NoError(t, err)
		require.NotNilf(t, cert.JSON200, "reading the certificate returned %d: %s", cert.StatusCode(), apierr.Body(cert.Body))
		require.Equal(t, "discovered", *cert.JSON200.Certificate.Source)
	})

	t.Run("should refresh the same installation and certificate when the name is scanned again", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A job's manual scans are limited to one a day, so the second scan is a second job
			on the same name. Installations belong to the project and are keyed by location, so it
			is the same deduplication a rescan goes through.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		scanned(t, tn, newDiscovery(t, tn, proj, "443", name))
		before := installationsNamed(t, tn, proj, name)
		require.Len(t, before, 1)
		firstCerts := certificatesAt(t, tn, before[0].ID)

		// Action
		got := scanned(t, tn, newDiscovery(t, tn, proj, "443", name))

		// Assert
		require.Equal(t, "completed", got.JSON200.Status)
		after := installationsNamed(t, tn, proj, name)
		require.Len(t, after, 1)
		require.Equal(t, before[0].ID, after[0].ID)
		require.True(t, after[0].LastSeenAt.After(before[0].LastSeenAt), "lastSeenAt should advance: %s then %s", before[0].LastSeenAt, after[0].LastSeenAt)
		require.Equal(t, firstCerts, certificatesAt(t, tn, after[0].ID))
	})

	t.Run("should add a rotated certificate to the installation and keep the one it replaced", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		scanned(t, tn, newDiscovery(t, tn, proj, "443", name))
		first := installationsNamed(t, tn, proj, name)
		require.Len(t, first, 1)
		original := certificatesAt(t, tn, first[0].ID)
		require.Len(t, original, 1)
		certPEM, keyPEM := selfSignedServerCert(t, name)
		fakenet.ServeCertificate(t, fixture.FakenetAdmin(t, tn), name, certPEM, keyPEM)

		// Action
		scanned(t, tn, newDiscovery(t, tn, proj, "443", name))

		// Assert
		after := installationsNamed(t, tn, proj, name)
		require.Len(t, after, 1)
		certs := certificatesAt(t, tn, after[0].ID)
		require.Len(t, certs, 2)
		require.Contains(t, certs, original[0])
	})

	t.Run("should complete with nothing found when no server answers on the port", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] The scan records no message, so a job whose every target refused the
			connection reads the same as one whose targets serve no certificate.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		discovery := newDiscovery(t, tn, proj, "8443", name)

		// Action
		got := scanned(t, tn, discovery)

		// Assert
		require.Equal(t, "completed", got.JSON200.Status)
		require.NotNil(t, got.JSON200.CertificatesFoundCount)
		require.Equal(t, float32(0), *got.JSON200.CertificatesFoundCount)
		require.Nil(t, got.JSON200.ErrorMessage)
		require.Empty(t, installationsNamed(t, tn, proj, name))
	})

	t.Run("should refuse a scan while another scan runs in the project", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The first scan targets fakenet's stall port, which accepts and never answers, so it
			holds the project's scan slot from the trigger until the scanner's 10-second per-endpoint
			timeout (DEFAULT_SCAN_TIMEOUT) runs out after the job starts. Both triggers share an
			8-second budget that starts before the first is sent, so any answer the competing one
			gets falls inside that overlap.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		running := newDiscovery(t, tn, proj, strconv.Itoa(fakenet.StallPort), targetName())
		other := newDiscovery(t, tn, proj, "443", targetName())
		ctx, cancel := context.WithTimeout(t.Context(), 8*time.Second)
		defer cancel()
		first, err := tn.Admin.API.TriggerPkiDiscoveryScanWithResponse(ctx, running)
		require.NoError(t, err, "triggering the first scan to establish overlap")
		require.Equalf(t, http.StatusOK, first.StatusCode(), "triggering the first scan: %s", apierr.Body(first.Body))

		// Action
		res, err := tn.Admin.API.TriggerPkiDiscoveryScanWithResponse(ctx, other)

		// Assert
		require.NoError(t, err, "the competing trigger has to answer while the first scan is certain to hold the slot")
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Another scan is already running in this project. Only one concurrent scan per project is allowed.", apierr.Message(res.Body))
		state, err := tn.Admin.API.GetPkiDiscoveryWithResponse(t.Context(), other)
		require.NoError(t, err)
		require.NotNil(t, state.JSON200)
		require.Nil(t, state.JSON200.LastScanStatus)
	})
}
