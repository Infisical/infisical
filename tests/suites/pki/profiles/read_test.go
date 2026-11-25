package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list every profile of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, policy := pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t))
		first, second := pki.NewProfile(t, proj, ca, policy), pki.NewProfile(t, proj, ca, policy)

		// Action
		res, err := tn.Admin.API.ListCertificateProfilesWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing profiles returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var slugs []string
		for _, p := range res.JSON200.CertificateProfiles {
			slugs = append(slugs, p.Slug)
		}
		require.ElementsMatch(t, []string{first.Slug, second.Slug}, slugs)
		require.EqualValues(t, 2, res.JSON200.TotalCount)
	})

	t.Run("should return the profile with its CA and policy when read by id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, policy := pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t))
		profile := pki.NewProfile(t, proj, ca, policy)

		// Action
		res, err := tn.Admin.API.GetCertificateProfileWithResponse(t.Context(), profile.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got := res.JSON200.CertificateProfile
		require.Equal(t, profile.Slug, got.Slug)
		require.Equal(t, &ca.ID, got.CaId)
		require.Equal(t, policy.ID, got.CertificatePolicyId)
	})

	t.Run("should return the same profile when read by slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, policy := pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t))
		profile := pki.NewProfile(t, proj, ca, policy)

		// Action
		res, err := tn.Admin.API.GetCertificateProfileBySlugWithResponse(t.Context(), profile.Slug)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the profile by slug returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, profile.ID, res.JSON200.CertificateProfile.Id)
		require.Equal(t, &ca.ID, res.JSON200.CertificateProfile.CaId)
	})

	t.Run("should not find another organization's profile by slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		proj := pki.CertManager(t, owner)
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t)))

		// Action
		res, err := other.Admin.API.GetCertificateProfileBySlugWithResponse(t.Context(), profile.Slug)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	})
}
