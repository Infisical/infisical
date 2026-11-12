package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Profile is a certificate profile: a CA and the policy it issues under.
type Profile struct{ ID uuid.UUID }

func NewProfile(tt *testing.T, p *Project, ca CA, policy Policy) Profile {
	tt.Helper()
	res, err := p.tn.Admin.API.CreateCertificateProfileWithResponse(tt.Context(), api.CreateCertificateProfileJSONRequestBody{
		ProjectId:           new(p.ID.String()),
		Slug:                "profile-" + id.Short(),
		CaId:                &ca.ID,
		CertificatePolicyId: policy.ID,
	})
	require.NoError(tt, err, "creating a certificate profile")
	require.NotNilf(tt, res.JSON200, "creating a certificate profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return Profile{ID: res.JSON200.CertificateProfile.Id}
}
