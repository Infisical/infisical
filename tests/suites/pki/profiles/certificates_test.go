package profiles_test

import (
	"bytes"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
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

	t.Run("should not list another organization's profile certificates", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		g := pki.NewGraph(t, owner)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".cross.test"))

		// Action
		res, err := other.Admin.API.ListCertificateProfileCertificatesWithResponse(t.Context(), g.Profile.ID, nil)

		// Assert
		require.NoError(t, err)
		require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), cert.SerialNumber)
		require.NotContains(t, string(res.Body), cert.ID.String())
	})
}

func TestCertificateProfile_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer another organization's profile id with the same 404 as an unknown id", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Another organization's profile id answers 403 naming the project, while an
			unknown id answers 404, which tells a caller the id exists.`)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		g := pki.NewGraph(t, owner)

		unknownID := uuid.New()

		// Action
		cross, err := other.Admin.API.ListCertificateProfileCertificatesWithResponse(t.Context(), g.Profile.ID, nil)
		require.NoError(t, err)
		unknown, err := other.Admin.API.ListCertificateProfileCertificatesWithResponse(t.Context(), unknownID, nil)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusNotFound, cross.StatusCode(), "answered: %s", apierr.Body(cross.Body))
		require.Equalf(t, http.StatusNotFound, unknown.StatusCode(), "answered: %s", apierr.Body(unknown.Body))
		require.Equal(t, apierr.Public(t, bytes.ReplaceAll(unknown.Body, []byte(unknownID.String()), []byte(g.Profile.ID.String()))),
			apierr.Public(t, cross.Body))
	})

	t.Run("should page through the profile's live certificates without gaps, duplicates or another profile's instead of failing on a missing column", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		set := newListedSet(t, tn)

		// Action
		var pages [][]string
		for _, offset := range []float32{0, 2, 4} {
			pages = append(pages, profileCertificateIDs(t, tn, set.profile, &api.ListCertificateProfileCertificatesParams{
				Offset: new(offset),
				Limit:  new(float32(2)),
			}))
		}

		// Assert
		require.Len(t, pages[0], 2)
		require.Len(t, pages[1], 2)
		require.Empty(t, pages[2])
		require.ElementsMatch(t, set.live, append(pages[0], pages[1]...))
	})

	t.Run("should list exactly the certificate each status and search filter names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		set := newListedSet(t, tn)
		list := func(params api.ListCertificateProfileCertificatesParams) []string {
			return profileCertificateIDs(t, tn, set.profile, &params)
		}

		// Action
		revoked := list(api.ListCertificateProfileCertificatesParams{Status: new(api.ListCertificateProfileCertificatesParamsStatusRevoked)})
		deleted := list(api.ListCertificateProfileCertificatesParams{Status: new(api.ListCertificateProfileCertificatesParamsStatusDeleted)})
		searched := list(api.ListCertificateProfileCertificatesParams{Search: new(set.searchCN)})

		// Assert
		require.Equal(t, []string{set.revoked}, revoked)
		require.Equal(t, []string{set.deleted}, deleted)
		require.Equal(t, []string{set.searched}, searched)
	})
}
