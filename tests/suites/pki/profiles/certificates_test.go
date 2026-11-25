package profiles_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Certificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the newest active certificate with its chain and key as the latest bundle", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		g.Issue(t, pki.ServerCertificate(id.Short()+".older.test"))
		newest := g.Issue(t, pki.ServerCertificate(id.Short()+".newer.test"))

		// Action
		res, err := tn.Admin.API.GetCertificateProfileLatestActiveBundleWithResponse(t.Context(), g.Profile.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the latest bundle returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.SerialNumber)
		require.Equal(t, newest.SerialNumber, *res.JSON200.SerialNumber)
		require.Equal(t, newest.Certificate, *res.JSON200.Certificate)
		require.Equal(t, newest.Chain, *res.JSON200.CertificateChain)
		require.Equal(t, strings.TrimSpace(newest.PrivateKey), strings.TrimSpace(*res.JSON200.PrivateKey))
	})

	t.Run("should return an empty bundle when the newest certificate is revoked and none other is active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".revoked.test"))
		pki.Revoke(t, tn.Admin, cert, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		res, err := tn.Admin.API.GetCertificateProfileLatestActiveBundleWithResponse(t.Context(), g.Profile.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the latest bundle returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Nil(t, res.JSON200.SerialNumber)
		require.Nil(t, res.JSON200.Certificate)
	})
}

func TestCertificateProfile_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list exactly the certificates issued from the profile instead of failing on a missing column", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		other := secondProfile(t, tn, g)
		first := g.Issue(t, pki.ServerCertificate(id.Short()+".one.test"))
		second := g.Issue(t, pki.ServerCertificate(id.Short()+".two.test"))
		pki.Issue(t, g.App, other, pki.ServerCertificate(id.Short()+".other.test"), pki.As(g.Operator))

		// Action
		res, err := tn.Admin.API.ListCertificateProfileCertificatesWithResponse(t.Context(), g.Profile.ID, nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing the profile's certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var serials []string
		for _, c := range res.JSON200.Certificates {
			serials = append(serials, c.SerialNumber)
		}
		require.ElementsMatch(t, []string{first.SerialNumber, second.SerialNumber}, serials)
	})

}
