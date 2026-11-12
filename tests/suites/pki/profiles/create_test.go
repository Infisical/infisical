package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
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
}
