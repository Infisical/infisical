package ca_test

import (
	"crypto/ecdsa"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

// rootNotAfter is whole seconds, so the CA's notAfter can be compared to it exactly.
var rootNotAfter = time.Now().AddDate(10, 0, 0).UTC().Truncate(time.Second)

func rootBody(p *pki.Project, name string) api.CreateInternalCertificateAuthorityV1JSONRequestBody {
	body := api.CreateInternalCertificateAuthorityV1JSONRequestBody{
		ProjectId: &p.ID,
		Name:      name,
		Status:    api.CreateInternalCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.Type = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationTypeRoot
	body.Configuration.KeyAlgorithm = api.CreateInternalCertificateAuthorityV1JSONBodyConfigurationKeyAlgorithmECPrime256v1
	body.Configuration.CommonName = new("Harness Root " + name)
	body.Configuration.Organization = new("Acme")
	body.Configuration.NotAfter = new(rootNotAfter.Format(time.RFC3339))
	return body
}

func TestInternalCA_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create an active self-signed root on the requested key, subject and expiry", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		name := "root-" + id.Short()

		// Action
		res, err := tn.Admin.API.CreateInternalCertificateAuthorityV1WithResponse(t.Context(), rootBody(p, name))

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the root returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		cert := pki.CACertificate(t, tn.Admin, res.JSON200.Id)
		require.NoError(t, cert.CheckSignatureFrom(cert))
		require.True(t, cert.IsCA)
		require.IsType(t, &ecdsa.PublicKey{}, cert.PublicKey)
		require.Equal(t, "Harness Root "+name, cert.Subject.CommonName)
		require.Equal(t, []string{"Acme"}, cert.Subject.Organization)
		require.Equal(t, rootNotAfter, cert.NotAfter.UTC())
	})

	t.Run("should refuse a Product Member and create no CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		member := tn.NewUser(t, harness.WithName("member"))
		p.Grant(t, member)
		before := caCount(t, tn)

		// Action
		res, err := member.API.CreateInternalCertificateAuthorityV1WithResponse(t.Context(), rootBody(p, "root-"+id.Short()))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not allowed to create on certificate-authorities", apierr.Message(res.Body))
		require.Equal(t, before, caCount(t, tn))
	})
}

func TestInternalCA_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse another organization the CA without returning it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `getCaCertificate is public on purpose (getCaCertPublic), so the CA record is the
			read that has to stay inside the organization. [BUG?] An unknown id answers 404 and another
			organization's id 403 naming the project, which tells a caller the id exists.`)

		// Setup
		owner, other := h.NewTenant(t), h.NewTenant(t)
		ca := pki.NewInternalCA(t, pki.CertManager(t, owner))

		// Action
		res, err := other.Admin.API.GetInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(res.Body))
	})
}

func caCount(t *testing.T, tn *harness.Tenant) int {
	t.Helper()
	res, err := tn.Admin.API.GetCertificateAuthorityQuotaV1WithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the CA quota returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.CertificateAuthorities.Used
}
