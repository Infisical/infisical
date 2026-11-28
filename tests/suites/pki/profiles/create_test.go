package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a profile that issues from the CA under the policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, policy := pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t))
		slug := "profile-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateCertificateProfileWithResponse(t.Context(), api.CreateCertificateProfileJSONRequestBody{
			ProjectId:           new(proj.ID.String()),
			Slug:                slug,
			Description:         new(""),
			CaId:                &ca.ID,
			CertificatePolicyId: policy.ID,
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		created := res.JSON200.CertificateProfile
		require.NotEqual(t, uuid.Nil, created.Id)
		require.Equal(t, slug, created.Slug)
		require.Equal(t, &ca.ID, created.CaId)
		require.Equal(t, policy.ID, created.CertificatePolicyId)
	})

	t.Run("should refuse a CA ID that does not exist and quote it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		policy := pki.NewPolicy(t, proj, pki.AllowAll(t))
		missing := uuid.New()

		// Action
		res, err := tn.Admin.API.CreateCertificateProfileWithResponse(t.Context(), api.CreateCertificateProfileJSONRequestBody{
			ProjectId:           new(proj.ID.String()),
			Slug:                "profile-" + id.Short(),
			CaId:                &missing,
			CertificatePolicyId: policy.ID,
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "Certificate authority with ID '"+missing.String()+"' not found. List your organization's certificate authorities with GET /api/v1/cert-manager/ca to find the right ID.", apierr.Message(res.Body))
		require.Empty(t, profileSlugs(t, tn))
	})

	t.Run("should answer another organization's policy as not found, like a missing one", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		foreign := pki.NewPolicy(t, pki.CertManager(t, owner), pki.AllowAll(t))
		proj := pki.CertManager(t, other)
		ca := pki.NewInternalCA(t, proj)
		missing := uuid.New()
		create := func(policyID uuid.UUID) *api.CreateCertificateProfileResponse {
			res, err := other.Admin.API.CreateCertificateProfileWithResponse(t.Context(), api.CreateCertificateProfileJSONRequestBody{
				ProjectId:           new(proj.ID.String()),
				Slug:                "profile-" + id.Short(),
				CaId:                &ca.ID,
				CertificatePolicyId: policyID,
			})
			require.NoError(t, err)
			return res
		}

		// Action
		cross, absent := create(foreign.ID), create(missing)

		// Assert
		require.Equalf(t, http.StatusNotFound, cross.StatusCode(), "answered: %s", apierr.Body(cross.Body))
		require.Equal(t, "Certificate policy with ID '"+foreign.ID.String()+"' not found. List your organization's certificate policies with GET /api/v1/cert-manager/certificate-policies to find the right ID.", apierr.Message(cross.Body))
		require.Equalf(t, http.StatusNotFound, absent.StatusCode(), "answered: %s", apierr.Body(absent.Body))
		require.Equal(t, "Certificate policy with ID '"+missing.String()+"' not found. List your organization's certificate policies with GET /api/v1/cert-manager/certificate-policies to find the right ID.", apierr.Message(absent.Body))
		require.Empty(t, profileSlugs(t, other))
	})
}
