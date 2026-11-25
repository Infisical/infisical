package profiles_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateProfile_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back a new slug and description", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, pki.AllowAll(t)))
		slug := "renamed-" + id.Short()

		// Action
		res, err := tn.Admin.API.UpdateCertificateProfileWithResponse(t.Context(), profile.ID, api.UpdateCertificateProfileJSONRequestBody{
			Slug:        &slug,
			Description: new("edge certificates"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the profile: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCertificateProfileWithResponse(t.Context(), profile.ID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the profile returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, slug, got.JSON200.CertificateProfile.Slug)
		require.Equal(t, new("edge certificates"), got.JSON200.CertificateProfile.Description)
	})

	t.Run("should issue with the updated default validity when the request names none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		body := api.UpdateCertificateProfileJSONRequestBody{}
		body.Defaults = &struct {
			BasicConstraints *struct {
				IsCA       bool `json:"isCA"`
				PathLength *int `json:"pathLength,omitempty"`
			} `json:"basicConstraints,omitempty"`
			CommonName       *string `json:"commonName,omitempty"`
			Country          *string `json:"country,omitempty"`
			CustomExtensions *[]struct {
				Critical *bool   `json:"critical,omitempty"`
				Label    *string `json:"label,omitempty"`
				Oid      string  `json:"oid"`
				Value    *string `json:"value,omitempty"`
			} `json:"customExtensions,omitempty"`
			DomainComponents   *[]string                                                        `json:"domainComponents,omitempty"`
			ExtendedKeyUsages  *[]api.UpdateCertificateProfileJSONBodyDefaultsExtendedKeyUsages `json:"extendedKeyUsages,omitempty"`
			KeyAlgorithm       *api.UpdateCertificateProfileJSONBodyDefaultsKeyAlgorithm        `json:"keyAlgorithm,omitempty"`
			KeyUsages          *[]api.UpdateCertificateProfileJSONBodyDefaultsKeyUsages         `json:"keyUsages,omitempty"`
			Locality           *string                                                          `json:"locality,omitempty"`
			Organization       *string                                                          `json:"organization,omitempty"`
			OrganizationalUnit *string                                                          `json:"organizationalUnit,omitempty"`
			SignatureAlgorithm *api.UpdateCertificateProfileJSONBodyDefaultsSignatureAlgorithm  `json:"signatureAlgorithm,omitempty"`
			State              *string                                                          `json:"state,omitempty"`
			SubjectAltNames    *[]struct {
				Type  api.UpdateCertificateProfileJSONBodyDefaultsSubjectAltNamesType `json:"type"`
				Value string                                                          `json:"value"`
			} `json:"subjectAltNames,omitempty"`
			TtlDays *int `json:"ttlDays,omitempty"`
		}{TtlDays: new(7)}
		upd, err := tn.Admin.API.UpdateCertificateProfileWithResponse(t.Context(), g.Profile.ID, body)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "updating the profile: %s", apierr.Body(upd.Body))
		req := pki.ServerCertificate(id.Short() + ".defaults.test")
		req.Attributes.Ttl = nil

		// Action
		cert := g.Issue(t, req)

		// Assert
		leaf := pki.ParseLeaf(t, cert.Certificate)
		require.Equal(t, 7*24*time.Hour, leaf.NotAfter.Sub(leaf.NotBefore).Round(time.Hour))
	})
}
