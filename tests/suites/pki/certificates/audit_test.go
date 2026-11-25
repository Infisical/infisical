package certificates_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificate_AuditLog(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record issuance and renewal with the operator and the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		original := g.Issue(t, pki.ServerCertificate(id.Short()+".audit.test"))
		res := pki.Renew(t, g.Operator, original.ID, map[string]any{})
		require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Assert
		issued := fixture.RequireAuditedBy(t, tn, g.Operator, "issue-certificate-from-profile", "certificateId", original.ID.String())
		require.Equal(t, g.App.ID.String(), issued["applicationId"])
		require.Equal(t, g.Profile.ID.String(), issued["certificateProfileId"])
		require.Equal(t, original.SerialNumber, issued["serialNumber"])
		renewed := fixture.RequireAuditedBy(t, tn, g.Operator, "renew-certificate", "originalCertificateId", original.ID.String())
		require.Equal(t, res.JSON200.CertificateId, renewed["newCertificateId"])
		require.Equal(t, g.App.ID.String(), renewed["applicationId"])
	})

	t.Run("should record revocation with its reason and deletion with the status the certificate had", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Revoked and deleted by the Product Admin, as in TestCertificate_Delete: neither is an operator's to do today.")

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".audit.test"))

		// Action
		pki.Revoke(t, tn.Admin, issued, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		res, err := tn.Admin.API.DeleteCertificateWithResponse(t.Context(), issued.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting answered: %s", apierr.Body(res.Body))

		// Assert
		revoked := fixture.RequireAuditedBy(t, tn, tn.Admin, "revoke-cert", "certId", issued.ID.String())
		require.Equal(t, string(api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE), revoked["revocationReason"])
		require.Equal(t, issued.SerialNumber, revoked["serialNumber"])
		deleted := fixture.RequireAuditedBy(t, tn, tn.Admin, "delete-cert", "certId", issued.ID.String())
		require.Equal(t, "revoked", deleted["statusAtDeletion"])
	})

	t.Run("should not record a refused revocation as a revocation", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		issued := g.Issue(t, pki.ServerCertificate(id.Short()+".audit.test"))
		outsider := tn.NewUser(t, harness.WithName("outsider"))
		g.Project.Grant(t, outsider)
		refused := pki.RevokeRequest(t, outsider, issued.ID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)
		require.Equalf(t, http.StatusForbidden, refused.StatusCode(), "%s", apierr.Body(refused.Body))

		// Action
		pki.Revoke(t, tn.Admin, issued, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		spec.Why(t, "the refused revocation came first, so once the admin's is logged a recorded refusal would be too")
		fixture.RequireAuditedBy(t, tn, tn.Admin, "revoke-cert", "certId", issued.ID.String())
	})
}
