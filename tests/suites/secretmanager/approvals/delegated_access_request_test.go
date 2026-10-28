package approvals_test

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/servicenow"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// Sending a request to ServiceNow and reading its decision back both go through the
// event outbox, whose relay polls every 10 seconds and has no manual trigger.
const outboxWait = 30 * time.Second

// quietWait is how long nothing has to happen: past one relay poll, and short of the 30
// second backoff before a read-back that found no decision runs again.
const quietWait = 20 * time.Second

func TestDelegatedAccessRequest_Decision(t *testing.T) {
	t.Parallel()

	t.Run("should grant the requester access when ServiceNow approves", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Approved(req.record.SysID))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, delegatedState{status: "approved", delegated: "approved", granted: true}, req.await(t, "approved"))
		wait.Until(t, "the requester to read the secret", func() bool { return req.readSecret(t) == http.StatusOK },
			wait.Timeout(outboxWait), wait.Interval(time.Second))
	})

	t.Run("should close the request without a grant when ServiceNow rejects", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Rejected(req.record.SysID, "Not during the release freeze."))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, delegatedState{status: "rejected", delegated: "rejected"}, req.await(t, "rejected"))
		require.Equal(t, http.StatusForbidden, req.readSecret(t))
	})

	t.Run("should close the request without a grant when ServiceNow records a decision Infisical does not recognise", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Instance{AccessRequests: map[string]*servicenow.AccessRequest{
			req.record.SysID: {Decision: "cancelled"},
		}})

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		closed := req.await(t, "failed")
		require.Equal(t, delegatedState{status: "rejected", delegated: "failed", reason: closed.reason}, closed)
		require.Contains(t, closed.reason, "does not recognise ('cancelled')")
		require.Equal(t, http.StatusForbidden, req.readSecret(t))
	})

	t.Run("should keep waiting for a decision when ServiceNow expires the record without one", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "Infisical finalizes from the record's decision alone, so a record the customer's flow closed "+
			"without one reads as undecided, and the request stays open for a later callback, its expiry, or a cancel.")

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Expired(req.record.SysID))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		open, err := wait.For(t.Context(), func(ctx context.Context) (delegatedState, bool, error) {
			st, err := req.state(ctx)
			return st, err == nil && strings.Contains(st.reason, "(state: expired)"), err
		}, wait.Timeout(outboxWait))
		require.NoError(t, err, "waiting for the read-back to record the expired record")
		require.Equal(t, delegatedState{status: "pending", delegated: "waiting_approval", reason: open.reason}, open)
		require.Equal(t, http.StatusForbidden, req.readSecret(t))
	})

	t.Run("should cancel the request when the requester was deleted before ServiceNow approved", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The access request list drops a request whose requester is gone, so the cancellation "+
			"is observed through the policy, which cannot be edited while it has a pending request.")

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Approved(req.record.SysID))
		deleted, err := req.requester.API.DeleteUserWithResponse(t.Context())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, deleted.StatusCode(), "deleting the requester returned %s", apierr.Body(deleted.Body))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		wait.Until(t, "the policy to have no pending request", func() bool { return req.renamePolicy(t) == http.StatusOK },
			wait.Timeout(outboxWait), wait.Interval(time.Second))
		require.Equal(t, "renamed", accessPolicyName(t, req.proj, req.policyID))
	})

	t.Run("should not grant a requester who left the project before ServiceNow approved, even after they return", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The requester is added back only once the request has closed, because a decision read while "+
			"they are a member again would rightly grant them access. Until then they cannot list the request, so "+
			"the wait is on the policy, which cannot be edited while it has a pending request.")

		// Setup
		req := newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Approved(req.record.SysID))
		removed, err := req.tn.Admin.API.RemoveProjectMembersWithResponse(t.Context(), req.proj.ID,
			api.RemoveProjectMembersJSONRequestBody{Emails: &[]openapi_types.Email{openapi_types.Email(req.requester.Email)}})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, removed.StatusCode(), "removing the requester returned %s", apierr.Body(removed.Body))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		wait.Until(t, "the policy to have no pending request", func() bool { return req.renamePolicy(t) == http.StatusOK },
			wait.Timeout(outboxWait), wait.Interval(time.Second))
		req.proj.Grant(t, req.requester, "no-access")
		closed := req.current(t)
		require.Equal(t, delegatedState{status: "rejected", delegated: "failed", reason: closed.reason}, closed)
		require.Contains(t, closed.reason, "no longer a member of this project")
		require.Equal(t, http.StatusForbidden, req.readSecret(t))
	})
}

func TestDelegatedAccessRequest_CallbackLimit(t *testing.T) {
	t.Parallel()

	t.Run("should keep the request open when ServiceNow calls back a sixth time while its decision is being read", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		for range 5 {
			require.Equal(t, http.StatusOK, req.callback(t, req.record.CallbackToken))
		}

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		req.sn.ExpectEvent[servicenow.AccessRequestRead](t, nil, fakenet.Within(outboxWait))
		req.sn.ExpectNoEvent[servicenow.AccessRequestRead](t, nil, fakenet.Within(quietWait))
		open := req.current(t)
		require.Equal(t, delegatedState{status: "pending", delegated: "waiting_approval", reason: open.reason}, open)
	})

	t.Run("should keep the request open when a sixth callback arrives without a token", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		for range 5 {
			require.Equal(t, http.StatusForbidden, req.callback(t, ""))
		}

		// Action
		code := req.callback(t, "")

		// Assert
		require.Equal(t, http.StatusForbidden, code)
		require.Equal(t, delegatedState{status: "pending", delegated: "waiting_approval"}, req.current(t))
	})

	t.Run("should grant access when ServiceNow approves after six callbacks without a token", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := newWaitingDelegatedRequest(t)
		for range 6 {
			require.Equal(t, http.StatusForbidden, req.callback(t, ""))
		}
		req.sn.Seed(t, servicenow.Approved(req.record.SysID))

		// Action
		code := req.callback(t, req.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, delegatedState{status: "approved", delegated: "approved", granted: true}, req.await(t, "approved"))
	})
}

func TestDelegatedAccessRequest_CallbackToken(t *testing.T) {
	t.Parallel()

	t.Run("should not read the decision when the token belongs to another request", func(t *testing.T) {
		t.Parallel()

		// Setup
		req, other := newWaitingDelegatedRequest(t), newWaitingDelegatedRequest(t)
		req.sn.Seed(t, servicenow.Approved(req.record.SysID))

		// Action
		code := req.callback(t, other.record.CallbackToken)

		// Assert
		require.Equal(t, http.StatusForbidden, code)
		req.sn.ExpectNoEvent[servicenow.AccessRequestRead](t, nil, fakenet.Within(quietWait))
		require.Equal(t, delegatedState{status: "pending", delegated: "waiting_approval"}, req.current(t))
	})
}

func TestDelegatedAccessRequest_DuplicateCallback(t *testing.T) {
	t.Parallel()

	t.Run("should read the decision once when the same callback arrives twice at once", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "The decision is left pending so that every read-back that runs is visible; one that "+
			"found a decision would close the request, and a second would then have nothing to read.")

		// Setup
		req := newWaitingDelegatedRequest(t)
		client := req.tn.Anonymous(t)

		// Action
		codes, errs := make([]int, 2), make([]error, 2)
		var wg sync.WaitGroup
		for i := range codes {
			wg.Go(func() {
				codes[i], errs[i] = sendCallback(t.Context(), client, req.record.SysID, req.record.CallbackToken)
			})
		}
		wg.Wait()

		// Assert
		require.NoError(t, errors.Join(errs...))
		require.Equal(t, []int{http.StatusOK, http.StatusOK}, codes)
		req.sn.ExpectEvent[servicenow.AccessRequestRead](t, nil, fakenet.Within(outboxWait))
		req.sn.ExpectNoEvent[servicenow.AccessRequestRead](t, nil, fakenet.Within(quietWait))
	})
}

// delegatedRequest is an access request ServiceNow holds and has not decided yet. The
// test plays ServiceNow's side: it decides in the fake and sends the callback itself.
type delegatedRequest struct {
	tn        *harness.Tenant
	proj      *fixture.Project
	policyID  uuid.UUID
	requester *harness.Principal
	sn        *servicenow.ControlPlane
	id        uuid.UUID
	record    *servicenow.AccessRequest
}

// newWaitingDelegatedRequest has a requester with no access ask to read dev:/, where a
// delegated policy sends the request to ServiceNow.
func newWaitingDelegatedRequest(t *testing.T) *delegatedRequest {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	conn := newDelegatedApprovalSystem(t, tn)
	policyID, _ := newDelegatedAccessPolicy(t, proj, conn)
	secretmanager.CreateSecret(t, proj, "dev", "DB_PASSWORD", "hunter2")
	req := &delegatedRequest{
		tn:        tn,
		proj:      proj,
		policyID:  policyID,
		requester: proj.NewUser(t, fixture.WithPrincipalName("requester"), fixture.WithRoles("no-access")),
		sn:        servicenow.Open(t, conn.FakenetAdmin(t), conn.Nonce()),
	}

	req.id = requestAccess(t, req.requester, proj, "dev", "/")
	req.sn.ExpectEvent[servicenow.AccessRequestCreated](t, func(e servicenow.AccessRequestCreated) bool {
		return e.RequestID == req.id.String()
	}, fakenet.Within(outboxWait))
	req.await(t, "waiting_approval")
	req.record = req.sn.AccessRequest(t, req.id.String())
	return req
}

// delegatedState is the request as its requester sees it: Infisical's status, the
// delegated approval system's status and why it stopped, and whether access was granted.
type delegatedState struct {
	status    string
	delegated string
	reason    string
	granted   bool
}

func (r *delegatedRequest) state(ctx context.Context) (delegatedState, error) {
	res, err := r.requester.API.ListAccessApprovalRequestsWithResponse(ctx,
		&api.ListAccessApprovalRequestsParams{ProjectSlug: r.proj.Slug})
	if err != nil {
		return delegatedState{}, err
	}
	if res.JSON200 == nil {
		return delegatedState{}, fmt.Errorf("listing access requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	for _, item := range res.JSON200.Requests {
		if item.Id != r.id {
			continue
		}
		st := delegatedState{granted: item.Privilege != nil}
		if item.Status != nil {
			st.status = *item.Status
		}
		if item.DelegatedApproval != nil {
			st.delegated = string(item.DelegatedApproval.Status)
			if item.DelegatedApproval.StatusReason != nil {
				st.reason = *item.DelegatedApproval.StatusReason
			}
		}
		return st, nil
	}
	return delegatedState{}, fmt.Errorf("access request %s is not listed", r.id)
}

// await waits for the delegated approval system's status to reach want.
func (r *delegatedRequest) await(t *testing.T, want string) delegatedState {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (delegatedState, bool, error) {
		st, err := r.state(ctx)
		return st, err == nil && st.delegated == want, err
	}, wait.Timeout(outboxWait))
	require.NoErrorf(t, err, "waiting for the delegated request to reach %s", want)
	return got
}

func (r *delegatedRequest) current(t *testing.T) delegatedState {
	t.Helper()
	st, err := r.state(t.Context())
	require.NoError(t, err)
	return st
}

// callback sends what ServiceNow sends once an approver decides.
func (r *delegatedRequest) callback(t *testing.T, token string) int {
	t.Helper()
	code, err := sendCallback(t.Context(), r.tn.Anonymous(t), r.record.SysID, token)
	require.NoError(t, err)
	return code
}

// sendCallback takes no *testing.T so it can run on another goroutine.
func sendCallback(ctx context.Context, client *api.ClientWithResponses, sysID, token string) (int, error) {
	body := api.HandleDelegatedApprovalCallbackJSONRequestBody{Version: api.N1, Event: api.SecretsManagementAccessRequest}
	body.Details.ExternalId = sysID
	res, err := client.HandleDelegatedApprovalCallbackWithResponse(ctx,
		&api.HandleDelegatedApprovalCallbackParams{InfisicalApprovalToken: &token}, body)
	if err != nil {
		return 0, err
	}
	return res.StatusCode(), nil
}

func (r *delegatedRequest) renamePolicy(t *testing.T) int {
	t.Helper()
	res, err := r.tn.Admin.API.UpdateAccessApprovalPolicyWithBodyWithResponse(t.Context(), r.policyID.String(),
		"application/json", jsonBody(t, map[string]any{"name": "renamed", "allowedSelfApprovals": false}))
	require.NoError(t, err)
	return res.StatusCode()
}

func (r *delegatedRequest) readSecret(t *testing.T) int {
	t.Helper()
	res, err := r.requester.API.GetSecretByNameV4WithResponse(t.Context(), "DB_PASSWORD", &api.GetSecretByNameV4Params{
		ProjectId:   r.proj.ID,
		Environment: new("dev"),
		SecretPath:  new("/"),
	})
	require.NoError(t, err)
	return res.StatusCode()
}
