package signers_test

import (
	"bytes"
	"crypto/x509"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSigner_PublicKey(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the key of the signer's own certificate to an auditor", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, auditor := newSigner(t, tn, "auditor")
		other := pki.NewSigner(t, s.Project, pki.SignerMember(auditor, "auditor"))

		// Action
		res := publicKey(t, auditor, s.ID)

		// Assert
		require.NotNilf(t, res.JSON200, "reading the public key returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		der, err := base64.StdEncoding.DecodeString(res.JSON200.PublicKey)
		require.NoError(t, err)
		require.Equal(t, pki.SignerCertificate(t, tn, s.ID).RawSubjectPublicKeyInfo, der)
		require.NotEqual(t, pki.SignerCertificate(t, tn, other.ID).RawSubjectPublicKeyInfo, der)
		_, err = x509.ParsePKIXPublicKey(der)
		require.NoError(t, err)
	})

	t.Run("should return the new key once the signer's certificate is reissued", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, auditor := newSigner(t, tn, "auditor")
		before := pki.SignerCertificate(t, tn, s.ID)
		res, err := tn.Admin.API.ReissueSignerCertificateWithResponse(t.Context(), s.ID, api.ReissueSignerCertificateJSONRequestBody{
			CaId: *pki.SignerState(t, tn, s.ID).JSON200.CaId,
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reissuing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		status, reason := pki.WaitSigner(t, tn.Admin, s.ID)
		require.Equalf(t, "active", status, "reason: %s", reason)

		// Action
		got := publicKey(t, auditor, s.ID)

		// Assert
		require.NotNilf(t, got.JSON200, "reading the public key returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		after := pki.SignerCertificate(t, tn, s.ID)
		require.NotEqual(t, before.RawSubjectPublicKeyInfo, after.RawSubjectPublicKeyInfo)
		require.Equal(t, base64.StdEncoding.EncodeToString(after.RawSubjectPublicKeyInfo), got.JSON200.PublicKey)
	})

	t.Run("should refuse a Product Member who is not a member of the signer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, _ := newSigner(t, tn, "auditor")
		outsider := tn.NewUser(t, harness.WithName("outsider"))
		s.Project.Grant(t, outsider)

		// Action
		res := publicKey(t, outsider, s.ID)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not a member of this pki-signer.", apierr.Message(res.Body))
		require.NotContains(t, string(res.Body), base64.StdEncoding.EncodeToString(pki.SignerCertificate(t, tn, s.ID).RawSubjectPublicKeyInfo))
	})

	t.Run("should refuse another organization's admin and return none of the key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, _ := newSigner(t, tn, "auditor")
		stranger := h.NewTenant(t).Admin

		// Action
		res := publicKey(t, stranger, s.ID)

		// Assert
		require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), base64.StdEncoding.EncodeToString(pki.SignerCertificate(t, tn, s.ID).RawSubjectPublicKeyInfo))
	})
}

func TestSigner_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer another organization's signer id with the same 404 as an unknown id", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Another organization's signer id answers 403, while an unknown id answers
			404, which tells a caller the id exists.`)

		// Setup
		tn := h.NewTenant(t)
		s, _ := newSigner(t, tn, "auditor")
		stranger := h.NewTenant(t).Admin
		unknownID := uuid.New()

		// Action
		cross := publicKey(t, stranger, s.ID)
		unknown := publicKey(t, stranger, unknownID)

		// Assert
		require.Equalf(t, http.StatusNotFound, cross.StatusCode(), "answered: %s", apierr.Body(cross.Body))
		require.Equalf(t, http.StatusNotFound, unknown.StatusCode(), "answered: %s", apierr.Body(unknown.Body))
		require.Equal(t, apierr.Public(t, bytes.ReplaceAll(unknown.Body, []byte(unknownID.String()), []byte(s.ID.String()))),
			apierr.Public(t, cross.Body))
	})

	t.Run("should report the key algorithm the signer was created with", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `getKeyAlgorithmFamily (signer-service.ts) answers RSA_4096 for every RSA key,
			so a client choosing a verifier from the algorithm is told the wrong key size.`)

		// Setup
		tn := h.NewTenant(t)
		s, auditor := newSigner(t, tn, "auditor")

		// Action
		res := publicKey(t, auditor, s.ID)

		// Assert
		require.NotNilf(t, res.JSON200, "reading the public key returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, string(api.CreateSignerJSONBodyKeyAlgorithmRSA2048), res.JSON200.Algorithm)
	})
}

// publicKey reads the signer's public key as `as`.
func publicKey(t *testing.T, as *harness.Principal, signerID uuid.UUID) *api.GetSignerPublicKeyResponse {
	t.Helper()
	res, err := as.API.GetSignerPublicKeyWithResponse(t.Context(), signerID)
	require.NoError(t, err)
	return res
}
