package discovery_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestPkiDiscovery_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the project's discoveries", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		first := newDiscovery(t, tn, proj, "443", targetName())
		second := newDiscovery(t, tn, proj, "443", targetName())

		// Action
		res, err := tn.Admin.API.ListPkiDiscoveriesWithResponse(t.Context(), &api.ListPkiDiscoveriesParams{ProjectId: new(proj.ID.String())})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing discoveries returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []uuid.UUID
		for _, d := range res.JSON200.Discoveries {
			ids = append(ids, d.Id)
		}
		require.ElementsMatch(t, []uuid.UUID{first, second}, ids)
		require.EqualValues(t, 2, res.JSON200.TotalCount)
	})

	t.Run("should store a discovery's new name, description and schedule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		discovery := newDiscovery(t, tn, pki.CertManager(t, tn), "443", targetName())

		// Action
		res, err := tn.Admin.API.UpdatePkiDiscoveryWithResponse(t.Context(), discovery, api.UpdatePkiDiscoveryJSONRequestBody{
			Name:              new("renamed-discovery"),
			Description:       new("edge hosts"),
			IsAutoScanEnabled: new(true),
			ScanIntervalDays:  new(float32(7)),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating the discovery returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got, err := tn.Admin.API.GetPkiDiscoveryWithResponse(t.Context(), discovery)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the discovery returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "renamed-discovery", got.JSON200.Name)
		require.Equal(t, "edge hosts", *got.JSON200.Description)
		require.True(t, *got.JSON200.IsAutoScanEnabled)
		require.EqualValues(t, 7, *got.JSON200.ScanIntervalDays)
	})

	t.Run("should delete a discovery so it can no longer be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		discovery := newDiscovery(t, tn, pki.CertManager(t, tn), "443", targetName())

		// Action
		res, err := tn.Admin.API.DeletePkiDiscoveryWithResponse(t.Context(), discovery)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the discovery: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetPkiDiscoveryWithResponse(t.Context(), discovery)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted discovery: %s", apierr.Body(got.Body))
	})
}

func TestPkiInstallation_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store an installation's new name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		scanned(t, tn, newDiscovery(t, tn, proj, "443", name))
		found := installationsNamed(t, tn, proj, name)
		require.Len(t, found, 1)

		// Action
		res, err := tn.Admin.API.UpdatePkiInstallationWithResponse(t.Context(), found[0].ID, api.UpdatePkiInstallationJSONRequestBody{
			Name: new("edge-proxy"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating the installation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got, err := tn.Admin.API.GetPkiInstallationWithResponse(t.Context(), found[0].ID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the installation returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "edge-proxy", *got.JSON200.Name)
	})

	t.Run("should delete an installation so it is no longer listed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		name := targetName()
		scanned(t, tn, newDiscovery(t, tn, proj, "443", name))
		found := installationsNamed(t, tn, proj, name)
		require.Len(t, found, 1)

		// Action
		res, err := tn.Admin.API.DeletePkiInstallationWithResponse(t.Context(), found[0].ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the installation: %s", apierr.Body(res.Body))
		require.Empty(t, installationsNamed(t, tn, proj, name))
		got, err := tn.Admin.API.GetPkiInstallationWithResponse(t.Context(), found[0].ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted installation: %s", apierr.Body(got.Body))
	})
}
