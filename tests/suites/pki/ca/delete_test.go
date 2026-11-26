package ca_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestInternalCA_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove an unused CA from the list and from reads", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		kept, gone := pki.NewInternalCA(t, proj), pki.NewInternalCA(t, proj)

		// Action
		res, err := tn.Admin.API.DeleteInternalCertificateAuthorityV1WithResponse(t.Context(), gone.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the CA: %s", apierr.Body(res.Body))
		get, err := tn.Admin.API.GetInternalCertificateAuthorityV1WithResponse(t.Context(), gone.ID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, get.StatusCode(), "reading the deleted CA: %s", apierr.Body(get.Body))
		list, err := tn.Admin.API.ListInternalCertificateAuthoritiesV1WithResponse(t.Context(), nil)
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing CAs returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		var ids []string
		for _, ca := range *list.JSON200 {
			ids = append(ids, ca.Id.String())
		}
		require.Equal(t, []string{kept.ID.String()}, ids)
	})

	t.Run("should refuse to delete a CA a profile issues from and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))
		before, err := tn.Admin.API.GetInternalCertificateAuthorityV1WithResponse(t.Context(), g.CA.ID.String())
		require.NoError(t, err)
		require.NotNil(t, before.JSON200)

		// Action
		res, err := tn.Admin.API.DeleteInternalCertificateAuthorityV1WithResponse(t.Context(), g.CA.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "deleting the CA: %s", apierr.Body(res.Body))
		require.Equal(t, fmt.Sprintf("Cannot delete CA '%s' as it is currently in use by the following certificate profiles: %s. Please remove this CA from these profiles before deleting it.", before.JSON200.Name, g.Profile.Slug), apierr.Message(res.Body))
		require.Equal(t, "active", caStatus(t, tn.Admin.API, g.CA))
		profile, err := tn.Admin.API.GetCertificateProfileWithResponse(t.Context(), g.Profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, profile.StatusCode(), "reading the profile: %s", apierr.Body(profile.Body))
	})
}
