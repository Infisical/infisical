package signers_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSignerCertificate_Reissue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give the signer a certificate for a new key that signs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")
		before := certificateOf(t, tn, s.ID)
		caID := *signerState(t, tn, s.ID).JSON200.CaId

		// Action
		res, err := tn.Admin.API.ReissueSignerCertificateWithResponse(t.Context(), s.ID, api.ReissueSignerCertificateJSONRequestBody{
			CaId:       caID,
			CommonName: new("Harness Code Signing Reissued"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reissuing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		status, reason := pki.WaitSigner(t, tn.Admin, s.ID)
		require.Equalf(t, "active", status, "reason: %s", reason)
		after := certificateOf(t, tn, s.ID)
		require.NotEqual(t, before.SerialNumber, after.SerialNumber)
		require.Equal(t, "Harness Code Signing Reissued", after.Subject.CommonName)
		require.NotEqual(t, before.RawSubjectPublicKeyInfo, after.RawSubjectPublicKeyInfo)
		requireSigns(t, tn, operator, s.ID)
	})
}

func TestSignerCertificate_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give the signer a new certificate from the same CA with the same name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")
		before := certificateOf(t, tn, s.ID)

		// Action
		res, err := tn.Admin.API.RenewSignerCertificateWithResponse(t.Context(), s.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		status, reason := pki.WaitSigner(t, tn.Admin, s.ID)
		require.Equalf(t, "active", status, "reason: %s", reason)
		after := certificateOf(t, tn, s.ID)
		require.NotEqual(t, before.SerialNumber, after.SerialNumber)
		require.Equal(t, before.Subject.CommonName, after.Subject.CommonName)
		require.Equal(t, before.RawIssuer, after.RawIssuer)
		requireSigns(t, tn, operator, s.ID)
	})
}

func TestSignerCertificate_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should revoke the signer's certificate and stop it signing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")

		// Action
		res, err := tn.Admin.API.RevokeSignerCertificateWithResponse(t.Context(), s.ID, api.RevokeSignerCertificateJSONRequestBody{
			RevocationReason: api.RevokeSignerCertificateJSONBodyRevocationReasonKEYCOMPROMISE,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "revoking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "revoked", *signerState(t, tn, s.ID).JSON200.Status)
		signed, _ := pki.Sign(t, operator, s.ID)
		require.Equal(t, http.StatusBadRequest, signed.StatusCode())
		require.Equal(t, "Signer '"+signerState(t, tn, s.ID).JSON200.Name+"' can't be used because its certificate was revoked. Reissue it with a new key from the signer's options to keep signing.", apierr.Message(signed.Body))
	})
}
