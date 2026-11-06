package pki

import (
	"testing"

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
	slug := "profile-" + id.Short()
	res, err := p.tn.Admin.API.CreateCertificateProfileWithBodyWithResponse(tt.Context(), "application/json", jsonBody(tt, map[string]any{
		"projectId":           p.ID,
		"slug":                slug,
		"caId":                ca.ID,
		"certificatePolicyId": policy.ID,
	}))
	require.NoError(tt, err, "creating a certificate profile")
	require.NotNilf(tt, res.JSON200, "creating a certificate profile returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out struct {
		CertificateProfile struct {
			ID uuid.UUID `json:"id"`
		} `json:"certificateProfile"`
	}
	decode(tt, res.Body, &out)
	return Profile{ID: out.CertificateProfile.ID, Slug: slug}
}
