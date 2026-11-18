package signers_test

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// newSigner creates an active RSA-2048 signer issued by an internal CA, with a new
// Product Member holding role on it.
func newSigner(t *testing.T, tn *harness.Tenant, role string) (uuid.UUID, *harness.Principal) {
	t.Helper()
	proj := pki.CertManager(t, tn)
	ca := pki.NewInternalCA(t, proj)
	member := tn.NewUser(t, harness.WithName(role))
	proj.Grant(t, member)

	res, err := tn.Admin.API.CreateSignerWithResponse(t.Context(), api.CreateSignerJSONRequestBody{
		Name:               "signer-" + id.Short(),
		CaId:               &ca.ID,
		CommonName:         new("Harness Code Signing"),
		CertificateTtlDays: new(30),
		KeyAlgorithm:       new(api.CreateSignerJSONBodyKeyAlgorithmRSA2048),
		Members: &[]struct {
			Id   uuid.UUID                           `json:"id"`
			Kind api.CreateSignerJSONBodyMembersKind `json:"kind"`
			Role string                              `json:"role"`
		}{{Id: member.ID, Kind: api.CreateSignerJSONBodyMembersKindUser, Role: role}},
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	signerID := res.JSON200.Id

	type outcome struct {
		status string
		err    error
	}
	got, err := wait.For(t.Context(), func(ctx context.Context) (outcome, bool, error) {
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		res, err := tn.Admin.API.GetSignerByIdWithResponse(ctx, signerID)
		if err != nil {
			return outcome{}, false, fmt.Errorf("reading the signer: %w", err)
		}
		if res.JSON200 == nil {
			err := fmt.Errorf("reading the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
			temporary := res.StatusCode() == http.StatusTooManyRequests || res.StatusCode() >= 500
			return outcome{err: err}, !temporary, err
		}
		if res.JSON200.Status == nil {
			return outcome{}, false, nil
		}
		status := *res.JSON200.Status
		return outcome{status: status}, status != "pending", nil
	})
	require.NoError(t, err, "waiting for the signer to leave pending")
	require.NoError(t, got.err)
	require.Equal(t, "active", got.status, "the signer did not become active")
	return signerID, member
}

func digest(data string) (string, []byte) {
	sum := sha256.Sum256([]byte(data))
	return base64.StdEncoding.EncodeToString(sum[:]), sum[:]
}

func TestSigner_Sign(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return a signature over the digest that the signer's certificate verifies, and audit it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		signerID, operator := newSigner(t, tn, "operator")
		encoded, sum := digest("artifact-" + id.Short())

		// Action
		res, err := operator.API.SignDataWithResponse(t.Context(), signerID, api.SignDataJSONRequestBody{
			Data:             encoded,
			IsDigest:         new(true),
			SigningAlgorithm: api.SignDataJSONBodySigningAlgorithmRSASSAPKCS1V15SHA256,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "signing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		sig, err := base64.StdEncoding.DecodeString(res.JSON200.Signature)
		require.NoError(t, err)
		exported, err := tn.Admin.API.ExportSignerCertificateWithResponse(t.Context(), signerID)
		require.NoError(t, err)
		require.NotNilf(t, exported.JSON200, "exporting the certificate returned %d: %s", exported.StatusCode(), apierr.Body(exported.Body))
		block, _ := pem.Decode([]byte(exported.JSON200.CertificatePem))
		require.NotNil(t, block)
		cert, err := x509.ParseCertificate(block.Bytes)
		require.NoError(t, err)
		require.NoError(t, rsa.VerifyPKCS1v15(cert.PublicKey.(*rsa.PublicKey), crypto.SHA256, sum, sig))
		fixture.WaitForAuditEvents(t, tn, "pki-signer-sign", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["signerId"] == signerID.String()
		})
	})

	t.Run("should refuse an auditor signing and record no signing operation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		signerID, auditor := newSigner(t, tn, "auditor")
		encoded, _ := digest("artifact-" + id.Short())

		// Action
		res, err := auditor.API.SignDataWithResponse(t.Context(), signerID, api.SignDataJSONRequestBody{
			Data:             encoded,
			IsDigest:         new(true),
			SigningAlgorithm: api.SignDataJSONBodySigningAlgorithmRSASSAPKCS1V15SHA256,
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to sign on pki-signer", apierr.Message(res.Body))
		ops, err := tn.Admin.API.ListSigningOperationsWithResponse(t.Context(), signerID, nil)
		require.NoError(t, err)
		require.NotNilf(t, ops.JSON200, "listing signing operations returned %d: %s", ops.StatusCode(), apierr.Body(ops.Body))
		require.Empty(t, ops.JSON200.Operations)
	})
}
