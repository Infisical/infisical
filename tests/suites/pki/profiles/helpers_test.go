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

// secondProfile is another profile on the graph's CA and policy, attached to its
// application with API enrollment on.
func secondProfile(t *testing.T, tn *harness.Tenant, g *pki.Graph) pki.Profile {
	t.Helper()
	profile := pki.NewProfile(t, g.Project, g.CA, g.Policy)
	res, err := tn.Admin.API.AttachPkiApplicationProfilesWithResponse(t.Context(), g.App.ID, api.AttachPkiApplicationProfilesJSONRequestBody{ProfileIds: []uuid.UUID{profile.ID}})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "attaching the profile: %s", apierr.Body(res.Body))
	pki.EnableAPI(t, g.App, profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
	return profile
}

func policyName(t *testing.T, tn *harness.Tenant, policy pki.Policy) string {
	t.Helper()
	res, err := tn.Admin.API.GetCertificatePolicyWithResponse(t.Context(), policy.ID, nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.CertificatePolicy.Name
}

// profileSlugs and policyNames list what the tenant holds, so a refused create can check it saved nothing.
func profileSlugs(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListCertificateProfilesWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing profiles returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	slugs := []string{}
	for _, p := range res.JSON200.CertificateProfiles {
		slugs = append(slugs, p.Slug)
	}
	return slugs
}

func policyNames(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListCertificatePoliciesWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing policies returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, p := range res.JSON200.CertificatePolicies {
		names = append(names, p.Name)
	}
	return names
}

// listedSet is a profile holding five certificates, issued one after another so their
// creation times never tie: one revoked, one deleted, and one whose common name only it
// contains. A second profile holds one more, which no list of the first may return.
type listedSet struct {
	profile  pki.Profile
	live     []string
	revoked  string
	deleted  string
	searched string
	searchCN string
}

func newListedSet(t *testing.T, tn *harness.Tenant) listedSet {
	t.Helper()
	g := pki.NewGraph(t, tn)
	other := secondProfile(t, tn, g)
	var issued []pki.Certificate
	for range 5 {
		issued = append(issued, g.Issue(t, pki.ServerCertificate(id.Short()+".listed.test")))
	}
	pki.Issue(t, g.App, other, pki.ServerCertificate(id.Short()+".other.test"), pki.As(g.Operator))
	pki.Revoke(t, tn.Admin, issued[1], api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
	del, err := tn.Admin.API.DeleteCertificateWithResponse(t.Context(), issued[2].ID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, del.StatusCode(), "deleting a certificate: %s", apierr.Body(del.Body))
	searchCN := pki.ParseLeaf(t, issued[3].Certificate).Subject.CommonName
	set := listedSet{
		profile:  g.Profile,
		revoked:  issued[1].ID.String(),
		deleted:  issued[2].ID.String(),
		searched: issued[3].ID.String(),
		searchCN: searchCN,
	}
	for i, c := range issued {
		if i != 2 {
			set.live = append(set.live, c.ID.String())
		}
	}
	return set
}

// profileCertificateIDs lists the profile's certificates as the tenant admin.
func profileCertificateIDs(t *testing.T, tn *harness.Tenant, profile pki.Profile, params *api.ListCertificateProfileCertificatesParams) []string {
	t.Helper()
	res, err := tn.Admin.API.ListCertificateProfileCertificatesWithResponse(t.Context(), profile.ID, params)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the profile's certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []string{}
	for _, c := range res.JSON200.Certificates {
		out = append(out, c.Id)
	}
	return out
}
