package signers_test

import (
	"crypto"
	"crypto/rsa"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSigner_Sign(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return a signature over the digest that the signer's certificate verifies, and audit it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, operator := newSigner(t, tn, "operator")
		signerID := s.ID

		// Action
		res, sum := pki.Sign(t, operator, signerID)

		// Assert
		require.NotNilf(t, res.JSON200, "signing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		sig, err := base64.StdEncoding.DecodeString(res.JSON200.Signature)
		require.NoError(t, err)
		require.NoError(t, rsa.VerifyPKCS1v15(certificateOf(t, tn, signerID).PublicKey.(*rsa.PublicKey), crypto.SHA256, sum, sig))
		fixture.WaitForAuditEvents(t, tn, "pki-signer-sign", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["signerId"] == signerID.String()
		})
	})

	t.Run("should refuse an auditor signing and record no signing operation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		s, auditor := newSigner(t, tn, "auditor")
		signerID := s.ID

		// Action
		res, _ := pki.Sign(t, auditor, signerID)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to sign on pki-signer", apierr.Message(res.Body))
		ops, err := tn.Admin.API.ListSigningOperationsWithResponse(t.Context(), signerID, nil)
		require.NoError(t, err)
		require.NotNilf(t, ops.JSON200, "listing signing operations returned %d: %s", ops.StatusCode(), apierr.Body(ops.Body))
		require.Empty(t, ops.JSON200.Operations)
	})
}
