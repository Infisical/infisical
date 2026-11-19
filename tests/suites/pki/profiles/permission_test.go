package profiles_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Permission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an application operator creating a policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		body := pki.AllowAll(t)
		body.ProjectId = new(g.Project.ID.String())
		body.Name = "policy-" + id.Short()

		// Action
		res, err := g.Operator.API.CreateCertificatePolicyWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on certificate-policies", apierr.Message(res.Body))
		again, err := tn.Admin.API.CreateCertificatePolicyWithResponse(t.Context(), body)
		require.NoError(t, err)
		require.NotNilf(t, again.JSON200, "the admin creating the policy returned %d: %s", again.StatusCode(), apierr.Body(again.Body))
		require.Equal(t, body.Name, again.JSON200.CertificatePolicy.Name, "a taken name gets a suffix, so the refused request must not have written the policy")
	})

	t.Run("should refuse an application operator creating a profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		body := api.CreateCertificateProfileJSONRequestBody{
			ProjectId:           new(g.Project.ID.String()),
			Slug:                "profile-" + id.Short(),
			CaId:                &g.CA.ID,
			CertificatePolicyId: g.Policy.ID,
		}

		// Action
		res, err := g.Operator.API.CreateCertificateProfileWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on certificate-profiles", apierr.Message(res.Body))
		again, err := tn.Admin.API.CreateCertificateProfileWithResponse(t.Context(), body)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, again.StatusCode(), "the slug should still be free: %s", apierr.Body(again.Body))
	})
}
