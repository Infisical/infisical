package signers_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// issuedCertificate issues a certificate with one extended key usage through a new graph.
func issuedCertificate(t *testing.T, tn *harness.Tenant, eku api.CreateCertificateJSONBodyAttributesExtendedKeyUsages) pki.Certificate {
	t.Helper()
	g := pki.NewGraph(t, tn)
	body := pki.ServerCertificate(id.Short() + ".codesign.test")
	body.Attributes.ExtendedKeyUsages = &[]api.CreateCertificateJSONBodyAttributesExtendedKeyUsages{eku}
	return g.Issue(t, body)
}

// signerFromCertificate asks for a signer that uses an existing certificate, with
// operator as its operator.
func signerFromCertificate(t *testing.T, tn *harness.Tenant, certificateID uuid.UUID, operator *harness.Principal) *api.CreateSignerResponse {
	t.Helper()
	res, err := tn.Admin.API.CreateSignerWithResponse(t.Context(), api.CreateSignerJSONRequestBody{
		Name:          "signer-" + id.Short(),
		CertificateId: &certificateID,
		Members: &[]struct {
			Id   uuid.UUID                           `json:"id"`
			Kind api.CreateSignerJSONBodyMembersKind `json:"kind"`
			Role string                              `json:"role"`
		}{{Id: operator.ID, Kind: api.CreateSignerJSONBodyMembersKindUser, Role: "operator"}},
	})
	require.NoError(t, err)
	return res
}

func TestSigner_ExistingCertificate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a signer that signs with an existing code signing certificate and its key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cert := issuedCertificate(t, tn, api.CreateCertificateJSONBodyAttributesExtendedKeyUsagesCodeSigning)
		operator := tn.NewUser(t, harness.WithName("signer-operator"))
		pki.CertManager(t, tn).Grant(t, operator)

		// Action
		res := signerFromCertificate(t, tn, cert.ID, operator)

		// Assert
		require.NotNilf(t, res.JSON200, "creating the signer returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		status, reason := pki.WaitSigner(t, tn.Admin, res.JSON200.Id)
		require.Equalf(t, "active", status, "reason: %s", reason)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).SerialNumber, certificateOf(t, tn, res.JSON200.Id).SerialNumber)
		requireSigns(t, tn, operator, res.JSON200.Id)
	})

	t.Run("should refuse a certificate without the code signing usage and create no signer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cert := issuedCertificate(t, tn, api.CreateCertificateJSONBodyAttributesExtendedKeyUsagesServerAuth)
		operator := tn.NewUser(t, harness.WithName("signer-operator"))
		pki.CertManager(t, tn).Grant(t, operator)

		// Action
		res := signerFromCertificate(t, tn, cert.ID, operator)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Certificate must have the codeSigning extended key usage", apierr.Message(res.Body))
		list, err := tn.Admin.API.ListSignersWithResponse(t.Context(), &api.ListSignersParams{})
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing signers returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		require.Empty(t, list.JSON200.Signers)
	})
}
