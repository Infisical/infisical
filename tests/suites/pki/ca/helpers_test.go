package ca_test

import (
	"crypto/x509"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func caStatus(t *testing.T, client *api.ClientWithResponses, ca pki.CA) string {
	t.Helper()
	res, err := client.GetInternalCertificateAuthorityV1WithResponse(t.Context(), ca.ID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return string(res.JSON200.Status)
}

func pool(certs ...*x509.Certificate) *x509.CertPool {
	p := x509.NewCertPool()
	for _, c := range certs {
		p.AddCert(c)
	}
	return p
}

func x509VerifyCA(roots ...*x509.Certificate) x509.VerifyOptions {
	return x509.VerifyOptions{Roots: pool(roots...), KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}}
}
