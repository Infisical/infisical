package signers_test

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

// gatedSigner is a signer whose operator needs one approval, from approver, to sign.
type gatedSigner struct {
	pki.Signer
	operator, approver *harness.Principal
}

func newGatedSigner(t *testing.T, tn *harness.Tenant) gatedSigner {
	t.Helper()
	approver := tn.NewUser(t, harness.WithName("approver"))
	pki.CertManager(t, tn).Grant(t, approver)
	s, operator := newSigner(t, tn, "operator", pki.SignerMember(approver, "admin"))
	pki.RequireApproval(t, s, approver.ID, 5)
	return gatedSigner{Signer: s, operator: operator, approver: approver}
}

// requestID reads the approval request id at the top of a response, or under request.
func requestID(t *testing.T, body []byte, nested bool) uuid.UUID {
	t.Helper()
	var out struct {
		ID      uuid.UUID `json:"id"`
		Request struct {
			ID uuid.UUID `json:"id"`
		} `json:"request"`
	}
	require.NoError(t, json.Unmarshal(body, &out), string(body))
	if nested {
		return out.Request.ID
	}
	return out.ID
}

func (g gatedSigner) preApprove(t *testing.T, tn *harness.Tenant) uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.PreApproveSigningWithResponse(t.Context(), g.ID, api.PreApproveSigningJSONRequestBody{
		GranteeUserId:     &g.operator.ID,
		Justification:     "release 1.2.0",
		RequestedSignings: new(1),
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "pre-approving: %s", apierr.Body(res.Body))
	return requestID(t, res.Body, true)
}

// requireApprovalRequired checks a signing was refused for want of an approval.
func requireApprovalRequired(t *testing.T, tn *harness.Tenant, signerID uuid.UUID, res *api.SignDataResponse) {
	t.Helper()
	require.Equal(t, http.StatusForbidden, res.StatusCode())
	name := signerState(t, tn, signerID).JSON200.Name
	require.Equal(t, "Signing with signer '"+name+"' requires approved access, but none is currently active. Access may not have been requested or approved yet, may have expired, or may have reached its signature limit. Request signing access for this signer and try again once it's approved.", apierr.Message(res.Body))
}

func TestSignerRequest(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hold an operator's request to sign as pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGatedSigner(t, tn)

		// Action
		res, err := g.operator.API.RequestToSignWithResponse(t.Context(), g.ID, api.RequestToSignJSONRequestBody{
			Justification:     "release 1.2.0",
			RequestedSignings: new(1),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "requesting to sign: %s", apierr.Body(res.Body))
		id := requestID(t, res.Body, false)
		list, err := tn.Admin.API.ListSignerRequestsWithResponse(t.Context(), g.ID, &api.ListSignerRequestsParams{Statuses: new("pending")})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, list.StatusCode(), "listing requests: %s", apierr.Body(list.Body))
		var out struct {
			Requests []struct {
				ID uuid.UUID `json:"id"`
			} `json:"requests"`
		}
		require.NoError(t, json.Unmarshal(list.Body, &out))
		require.Len(t, out.Requests, 1)
		require.Equal(t, id, out.Requests[0].ID)
		signed, _ := pki.Sign(t, g.operator, g.ID)
		requireApprovalRequired(t, tn, g.ID, signed)
	})

	t.Run("should let an operator sign once an admin pre-approves them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGatedSigner(t, tn)

		// Action
		g.preApprove(t, tn)

		// Assert
		requireSigns(t, tn, g.operator, g.ID)
	})

	t.Run("should stop an operator signing once their approved request is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGatedSigner(t, tn)
		approved := g.preApprove(t, tn)

		// Action
		res, err := tn.Admin.API.RevokeSignerRequestWithResponse(t.Context(), g.ID, approved)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking the request: %s", apierr.Body(res.Body))
		signed, _ := pki.Sign(t, g.operator, g.ID)
		requireApprovalRequired(t, tn, g.ID, signed)
	})
}

func TestSignerApprovalPolicy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read back the approval policy a signer was given", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		approver := tn.NewUser(t, harness.WithName("approver"))
		pki.CertManager(t, tn).Grant(t, approver)
		s, _ := newSigner(t, tn, "operator", pki.SignerMember(approver, "admin"))

		// Action
		pki.RequireApproval(t, s, approver.ID, 3)

		// Assert
		got, err := tn.Admin.API.GetSignerApprovalPolicyWithResponse(t.Context(), s.ID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the approval policy returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.True(t, got.JSON200.HasSteps)
		require.Len(t, got.JSON200.Steps, 1)
		require.EqualValues(t, 3, *got.JSON200.Constraints.MaxSignings)
		require.Equal(t, s.ID, got.JSON200.SignerId)
	})

	t.Run("should let the operator sign directly once the policy's steps are removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGatedSigner(t, tn)
		var none api.UpdateSignerApprovalPolicyJSONRequestBody
		require.NoError(t, json.Unmarshal([]byte(`{"steps": []}`), &none))

		// Action
		res, err := tn.Admin.API.UpdateSignerApprovalPolicyWithResponse(t.Context(), g.ID, none)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "clearing the approval policy: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetSignerApprovalPolicyWithResponse(t.Context(), g.ID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the approval policy returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.False(t, got.JSON200.HasSteps)
		requireSigns(t, tn, g.operator, g.ID)
	})
}
