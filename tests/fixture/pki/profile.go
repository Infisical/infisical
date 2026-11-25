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
type Profile struct {
	ID   uuid.UUID
	Slug string
}

func NewProfile(tt *testing.T, p *Project, ca CA, policy Policy) Profile {
	tt.Helper()
	return createProfile(tt, p, profileBody(p, ca, policy))
}

// NewAutoRenewingProfile is a profile on ca with API enrollment of its own, outside any
// application, that turns auto-renewal on renewBeforeDays before expiry for every
// certificate it issues.
func NewAutoRenewingProfile(tt *testing.T, p *Project, ca CA, policy Policy, renewBeforeDays int) Profile {
	tt.Helper()
	body := profileBody(p, ca, policy)
	body.EnrollmentType = new(api.CreateCertificateProfileJSONBodyEnrollmentTypeApi)
	body.ApiConfig = &struct {
		AutoRenew       *bool    `json:"autoRenew,omitempty"`
		RenewBeforeDays *float32 `json:"renewBeforeDays,omitempty"`
	}{AutoRenew: new(true), RenewBeforeDays: new(float32(renewBeforeDays))}
	return createProfile(tt, p, body)
}

func profileBody(p *Project, ca CA, policy Policy) api.CreateCertificateProfileJSONRequestBody {
	return api.CreateCertificateProfileJSONRequestBody{
		ProjectId:           new(p.ID.String()),
		Slug:                "profile-" + id.Short(),
		CaId:                &ca.ID,
		CertificatePolicyId: policy.ID,
	}
}

func createProfile(tt *testing.T, p *Project, body api.CreateCertificateProfileJSONRequestBody) Profile {
	tt.Helper()
	res, err := p.tn.Admin.API.CreateCertificateProfileWithResponse(tt.Context(), body)
	require.NoError(tt, err, "creating a certificate profile")
	require.NotNilf(tt, res.JSON200, "creating a certificate profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return Profile{ID: res.JSON200.CertificateProfile.Id, Slug: res.JSON200.CertificateProfile.Slug}
}
