package signers_test

import (
	"crypto"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// newSigner creates an active signer issued by a new internal CA, with a new Product
// Member holding role on it.
func newSigner(t *testing.T, tn *harness.Tenant, role string, opts ...pki.SignerOption) (pki.Signer, *harness.Principal) {
	t.Helper()
	proj := pki.CertManager(t, tn)
	member := tn.NewUser(t, harness.WithName(role))
	proj.Grant(t, member)
	return pki.NewSigner(t, proj, append(opts, pki.SignerMember(member, role))...), member
}

// requireSigns signs as a principal and checks the signature against the signer's
// current certificate.
func requireSigns(t *testing.T, tn *harness.Tenant, as *harness.Principal, signerID uuid.UUID) {
	t.Helper()
	res, sum := pki.Sign(t, as, signerID)
	require.NotNilf(t, res.JSON200, "signing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	sig, err := base64.StdEncoding.DecodeString(res.JSON200.Signature)
	require.NoError(t, err)
	require.NoError(t, rsa.VerifyPKCS1v15(certificateOf(t, tn, signerID).PublicKey.(*rsa.PublicKey), crypto.SHA256, sum, sig))
}

// certificateOf is the signer's current leaf certificate.
func certificateOf(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) *x509.Certificate {
	t.Helper()
	res, err := tn.Admin.API.ExportSignerCertificateWithResponse(t.Context(), signerID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "exporting the certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return pki.ParseLeaf(t, res.JSON200.CertificatePem)
}

// signerState is the signer as the tenant admin reads it.
func signerState(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) *api.GetSignerByIdResponse {
	t.Helper()
	res, err := tn.Admin.API.GetSignerByIdWithResponse(t.Context(), signerID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}
