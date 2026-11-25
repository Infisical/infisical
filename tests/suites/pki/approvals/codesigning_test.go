package approvals_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCodeSigningApproval(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hold a signing request until the approver approves it, then let the requester sign", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		operator := tn.NewUser(t, harness.WithName("operator"))
		approver := tn.NewUser(t, harness.WithName("approver"))
		proj.Grant(t, operator)
		proj.Grant(t, approver)
		s := pki.NewSigner(t, proj, pki.SignerMember(operator, "operator"), pki.SignerMember(approver, "admin"))
		pki.RequireApproval(t, s, approver.ID, 1)
		requested, err := operator.API.RequestToSignWithResponse(t.Context(), s.ID, api.RequestToSignJSONRequestBody{
			Justification:     "release 1.2.0",
			RequestedSignings: new(1),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, requested.StatusCode(), "requesting to sign: %s", apierr.Body(requested.Body))
		var request struct {
			ID uuid.UUID `json:"id"`
		}
		require.NoError(t, json.Unmarshal(requested.Body, &request))
		early, _ := pki.Sign(t, operator, s.ID)
		require.Equal(t, http.StatusForbidden, early.StatusCode())

		// Action
		res, err := approver.API.ApproveCertCodeSigningApprovalRequestWithResponse(t.Context(), request.ID, api.ApproveCertCodeSigningApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "approving returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "approved", res.JSON200.Request.Status)
		signed, _ := pki.Sign(t, operator, s.ID)
		require.NotNilf(t, signed.JSON200, "signing after approval returned %d: %s", signed.StatusCode(), apierr.Body(signed.Body))
	})

	t.Run("should refuse the requester approving their own signing request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		operator := tn.NewUser(t, harness.WithName("operator"))
		proj.Grant(t, operator)
		s := pki.NewSigner(t, proj, pki.SignerMember(operator, "admin"))
		pki.RequireApproval(t, s, operator.ID, 1)
		requested, err := operator.API.RequestToSignWithResponse(t.Context(), s.ID, api.RequestToSignJSONRequestBody{
			Justification:     "release 1.2.0",
			RequestedSignings: new(1),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, requested.StatusCode(), "requesting to sign: %s", apierr.Body(requested.Body))
		var request struct {
			ID uuid.UUID `json:"id"`
		}
		require.NoError(t, json.Unmarshal(requested.Body, &request))

		// Action
		res, err := operator.API.ApproveCertCodeSigningApprovalRequestWithResponse(t.Context(), request.ID, api.ApproveCertCodeSigningApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You cannot approve your own signing request", apierr.Message(res.Body))
		signed, _ := pki.Sign(t, operator, s.ID)
		require.Equal(t, http.StatusForbidden, signed.StatusCode())
	})
}
