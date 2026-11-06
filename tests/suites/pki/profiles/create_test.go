package profiles_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

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
		ca, policy := pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj)
		slug := "profile-" + id.Short()
		body, err := json.Marshal(map[string]any{"projectId": proj.ID, "slug": slug, "description": "", "caId": ca.ID, "certificatePolicyId": policy.ID})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.CreateCertificateProfileWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(body))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		var out struct {
			CertificateProfile struct {
				ID                  uuid.UUID `json:"id"`
				Slug                string    `json:"slug"`
				CaID                uuid.UUID `json:"caId"`
				CertificatePolicyID uuid.UUID `json:"certificatePolicyId"`
			} `json:"certificateProfile"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &out))
		require.NotEqual(t, uuid.Nil, out.CertificateProfile.ID)
		require.Equal(t, slug, out.CertificateProfile.Slug)
		require.Equal(t, ca.ID, out.CertificateProfile.CaID)
		require.Equal(t, policy.ID, out.CertificateProfile.CertificatePolicyID)
	})
}
