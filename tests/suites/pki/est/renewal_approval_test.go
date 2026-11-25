package est_test

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEstEnrollment_RenewalApproval(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hold a re-enrollment for approval but issue a new enrollment at once", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newApprovalGated(t, tn, "renewal")
		original := g.stored(t, tn, g.issued)

		// Action
		fresh := g.enroll(t, newCSR(t, newKey(t), id.Short()+".est.test"), enrollOpts{})
		res := g.reenroll(t, newCSR(t, g.key, g.name), enrollOpts{clientCert: g.issued})

		// Assert
		require.Equalf(t, http.StatusOK, fresh.StatusCode(), "enrolling: %s", apierr.Body(fresh.Body))
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Message(res.Body), "requires approval")
		require.Nil(t, g.stored(t, tn, g.issued).RenewedBy, "nothing is linked while the renewal waits")
		held := g.pending(t)
		require.Len(t, held, 1)
		require.Equal(t, original.ID.String(), held[0].renewalOf)
		require.Equal(t, g.name, held[0].renewalOfName, "the approval request names the certificate being renewed")
		require.Contains(t, g.noticeFor(t, held[0].id), "asked to renew")
	})

	t.Run("should refuse a second re-enrollment while one waits and raise no second request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newApprovalGated(t, tn, "renewal")
		first := g.reenroll(t, newCSR(t, g.key, g.name), enrollOpts{clientCert: g.issued})
		require.Equalf(t, http.StatusBadRequest, first.StatusCode(), "the first re-enrollment: %s", apierr.Body(first.Body))

		// Action
		res := g.reenroll(t, newCSR(t, g.key, g.name), enrollOpts{clientCert: g.issued})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "A renewal of this certificate is already waiting for approval.", apierr.Message(res.Body))
		require.Len(t, g.pending(t), 1)
	})

	t.Run("should link the certificate an approved re-enrollment issues to the one it replaces", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newApprovalGated(t, tn, "renewal")
		original := g.stored(t, tn, g.issued)
		first := g.reenroll(t, newCSR(t, g.key, g.name), enrollOpts{clientCert: g.issued})
		require.Equalf(t, http.StatusBadRequest, first.StatusCode(), "the re-enrollment: %s", apierr.Body(first.Body))
		held := g.pending(t)
		require.Len(t, held, 1)

		// Action
		res, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), held[0].id, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "approving: %s", apierr.Body(res.Body))
		issued := pki.WaitRequest(t, tn.Admin, held[0].certificateRequestID,
			[]api.GetCertificateRequest200JSONResponseBodyStatus{api.GetCertificateRequest200JSONResponseBodyStatusIssued})
		require.NotNil(t, issued.JSON200.CertificateId)
		replacement, err := uuid.Parse(*issued.JSON200.CertificateId)
		require.NoError(t, err)
		require.Equal(t, &replacement, g.stored(t, tn, g.issued).RenewedBy)
		require.Equal(t, &original.ID, pki.ReadCertificate(t, tn.Admin, replacement).JSON200.Certificate.RenewedFromCertificateId)
	})

	t.Run("should hold a re-enrollment for approval when an Issuance policy covers the profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newApprovalGated(t, tn, "issuance")
		original := g.stored(t, tn, g.issued)

		// Action
		res := g.reenroll(t, newCSR(t, g.key, g.name), enrollOpts{clientCert: g.issued})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Message(res.Body), "requires approval")
		require.Nil(t, g.stored(t, tn, g.issued).RenewedBy, "nothing is linked while the renewal waits")
		held := g.pending(t)
		require.Len(t, held, 1)
		require.Equal(t, original.ID.String(), held[0].renewalOf)
	})

	for _, tc := range []struct {
		from      string
		elsewhere func(t *testing.T, tn *harness.Tenant, g approvalGated) estProfile
	}{
		{"another Application", func(t *testing.T, tn *harness.Tenant, g approvalGated) estProfile {
			other := *g.ApplicationGraph
			other.App = pki.NewApplication(t, g.Project, g.Profile)
			return enableEst(t, tn, &other, api.SetPkiApplicationEstEnrollmentJSONRequestBody{})
		}},
		{"another profile", func(t *testing.T, tn *harness.Tenant, g approvalGated) estProfile {
			other := *g.ApplicationGraph
			other.Profile = pki.NewProfile(t, g.Project, g.CA, g.Policy)
			other.App = pki.NewApplication(t, g.Project, other.Profile)
			return enableEst(t, tn, &other, api.SetPkiApplicationEstEnrollmentJSONRequestBody{})
		}},
	} {
		t.Run("should issue a re-enrollment with a client certificate from "+tc.from+" at once and unlinked when only a Renewal policy covers the profile", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			g := newApprovalGated(t, tn, "renewal")
			elsewhere := tc.elsewhere(t, tn, g)
			key, name := newKey(t), id.Short()+".est.test"
			issuedElsewhere := elsewhere.mustEnroll(t, key, name)

			// Action
			res := g.reenroll(t, newCSR(t, key, name), enrollOpts{clientCert: issuedElsewhere})

			// Assert
			require.Equalf(t, http.StatusOK, res.StatusCode(), "re-enrolling: %s", apierr.Body(res.Body))
			require.Empty(t, g.pending(t))
			require.Nil(t, elsewhere.stored(t, tn, issuedElsewhere).RenewedBy)
			require.Nil(t, g.stored(t, tn, certsOf(t, res.Body)[0]).RenewedFrom)
		})
	}
}

// approvalGated is an EST profile with a leaf already issued to a device, and an approval
// policy that a separate application admin approves.
type approvalGated struct {
	estProfile
	approver *harness.Principal
	key      *rsa.PrivateKey
	name     string
	issued   *x509.Certificate
}

// newApprovalGated issues the device its first certificate, then puts an approval policy for
// operation on the profile, so only what follows is held.
func newApprovalGated(t *testing.T, tn *harness.Tenant, operation string) approvalGated {
	t.Helper()
	p := newEstProfile(t, tn, api.SetPkiApplicationEstEnrollmentJSONRequestBody{}, pki.AllowAll(t))
	approver := tn.NewUser(t, harness.WithName("approver"))
	p.Project.Grant(t, approver)
	pki.AddMember(t, p.App, approver, "admin")
	key, name := newKey(t), id.Short()+".est.test"
	issued := p.mustEnroll(t, key, name)
	p.newApprovalPolicy(t, tn, operation, approver.ID)
	return approvalGated{estProfile: p, approver: approver, key: key, name: name, issued: issued}
}

// approvalHeld is a pending approval request on the application and what it holds.
type approvalHeld struct {
	id                   uuid.UUID
	certificateRequestID string
	renewalOf            string
	renewalOfName        string
}

// pending lists the application's pending approval requests as the approver sees them.
func (g approvalGated) pending(t *testing.T) []approvalHeld {
	t.Helper()
	res, err := g.approver.API.ListCertRequestApprovalRequestsWithResponse(t.Context(), &api.ListCertRequestApprovalRequestsParams{
		Scope: api.ListCertRequestApprovalRequestsParamsScopePkiApplication,
		Id:    g.App.ID,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing approval requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out struct {
		Requests []struct {
			ID          uuid.UUID `json:"id"`
			Status      string    `json:"status"`
			RequestData struct {
				RequestData struct {
					CertificateRequestID     string `json:"certificateRequestId"`
					RenewalOfCertificateID   string `json:"renewalOfCertificateId"`
					RenewalOfCertificateName string `json:"renewalOfCertificateName"`
				} `json:"requestData"`
			} `json:"requestData"`
		} `json:"requests"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	var held []approvalHeld
	for _, r := range out.Requests {
		if r.Status != "pending" {
			continue
		}
		held = append(held, approvalHeld{
			id:                   r.ID,
			certificateRequestID: r.RequestData.RequestData.CertificateRequestID,
			renewalOf:            r.RequestData.RequestData.RenewalOfCertificateID,
			renewalOfName:        r.RequestData.RequestData.RenewalOfCertificateName,
		})
	}
	return held
}

// noticeFor waits for the approver's in-app notification linking to an approval request and
// returns its body. Notifications are written from a queue after the response.
func (g approvalGated) noticeFor(t *testing.T, approvalID uuid.UUID) string {
	t.Helper()
	link := "/approvals/" + approvalID.String()
	body, err := wait.For(t.Context(), func(ctx context.Context) (string, bool, error) {
		res, err := g.approver.API.ListUserNotificationsWithResponse(ctx)
		if err != nil {
			return "", false, err
		}
		if res.JSON200 == nil {
			return "", false, fmt.Errorf("listing notifications returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		}
		for _, n := range res.JSON200.Notifications {
			if n.Link != nil && strings.Contains(*n.Link, link) && n.Body != nil {
				return *n.Body, true, nil
			}
		}
		return "", false, nil
	})
	require.NoErrorf(t, err, "waiting for the approver's notification about approval request %s", approvalID)
	return body
}
