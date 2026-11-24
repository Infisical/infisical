package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record a profile's creation, update and deletion with the admin and the profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t)))
		slug := "renamed-" + id.Short()

		// Action
		upd, err := tn.Admin.API.UpdateCertificateProfileWithResponse(t.Context(), profile.ID, api.UpdateCertificateProfileJSONRequestBody{Slug: &slug})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "updating the profile: %s", apierr.Body(upd.Body))
		del, err := tn.Admin.API.DeleteCertificateProfileWithResponse(t.Context(), profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting the profile: %s", apierr.Body(del.Body))

		// Assert
		created := fixture.RequireAuditedBy(t, tn, tn.Admin, "create-certificate-profile", "certificateProfileId", profile.ID.String())
		require.Equal(t, profile.Slug, created["name"])
		updated := fixture.RequireAuditedBy(t, tn, tn.Admin, "update-certificate-profile", "certificateProfileId", profile.ID.String())
		require.Equal(t, slug, updated["name"])
		fixture.RequireAuditedBy(t, tn, tn.Admin, "delete-certificate-profile", "certificateProfileId", profile.ID.String())
	})
}
