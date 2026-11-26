package inventory_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func newView(t *testing.T, as *harness.Principal) (uuid.UUID, string) {
	t.Helper()
	name := "view-" + id.Short()
	body := api.CreateCertificateInventoryViewJSONRequestBody{Name: name}
	res, err := as.API.CreateCertificateInventoryViewWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a view returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.View.Id, name
}

// customViews is the names of the caller's own views, by id.
func customViews(t *testing.T, as *harness.Principal) map[uuid.UUID]string {
	t.Helper()
	res, err := as.API.ListCertificateInventoryViewsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing views returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := map[uuid.UUID]string{}
	for _, v := range res.JSON200.CustomViews {
		out[v.Id] = v.Name
	}
	return out
}

func TestInventoryView(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list a created view among the creator's own views", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		viewID, name := newView(t, tn.Admin)

		// Assert
		require.Equal(t, map[uuid.UUID]string{viewID: name}, customViews(t, tn.Admin))
	})

	t.Run("should read back a renamed view", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		viewID, _ := newView(t, tn.Admin)
		name := "renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateCertificateInventoryViewWithResponse(t.Context(), viewID, api.UpdateCertificateInventoryViewJSONRequestBody{Name: &name})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the view: %s", apierr.Body(res.Body))
		require.Equal(t, map[uuid.UUID]string{viewID: name}, customViews(t, tn.Admin))
	})

	t.Run("should remove a deleted view from the list", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		viewID, _ := newView(t, tn.Admin)

		// Action
		res, err := tn.Admin.API.DeleteCertificateInventoryViewWithResponse(t.Context(), viewID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the view: %s", apierr.Body(res.Body))
		require.Empty(t, customViews(t, tn.Admin))
	})

	t.Run("should refuse to rename another user's view and keep its name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := tn.NewUser(t, harness.WithName("dana"))
		fixture.ExistingProject(tn, pki.CertManager(t, tn).ID.String()).Grant(t, other, "admin")
		viewID, name := newView(t, tn.Admin)

		// Action
		res, err := other.API.UpdateCertificateInventoryViewWithResponse(t.Context(), viewID, api.UpdateCertificateInventoryViewJSONRequestBody{Name: new("stolen-" + id.Short())})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "You can only update your own views", apierr.Message(res.Body))
		require.Equal(t, map[uuid.UUID]string{viewID: name}, customViews(t, tn.Admin))
	})
}
