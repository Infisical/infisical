package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type batchFailures = []struct {
	ApprovalRequestId uuid.UUID `json:"approvalRequestId"`
	Message           string    `json:"message"`
}

// batchProject holds three requests: one under a policy that names the reviewer, one under a
// policy that names someone else, and one the reviewer has already approved and merged.
type batchProject struct {
	protectedProject
	allowed, restricted, merged uuid.UUID
}

func newBatchProject(t *testing.T) batchProject {
	t.Helper()
	p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.SecretPath = "/open/**" })
	other := p.proj.NewUser(t, fixture.WithPrincipalName("other"))
	newPolicy(t, p.proj, []policyMember{userMember(other)},
		func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.SecretPath = "/restricted" })
	heldAt := func(folder string) uuid.UUID {
		secretmanager.CreateFolder(t, p.proj, "dev", folder)
		res, err := p.committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: p.proj.ID, Environment: "dev", SecretPath: new(folder), SecretValue: "value",
		})
		require.NoError(t, err)
		return heldRequest(t, p.proj, res.Body).ID
	}
	bp := batchProject{protectedProject: p, allowed: heldAt("/open/a"), restricted: heldAt("/restricted"), merged: heldAt("/open/b")}
	approve(t, p.reviewer, bp.merged)
	merge(t, p.reviewer, bp.merged)
	return bp
}

func failureMessages(failures batchFailures) map[uuid.UUID]string {
	messages := map[uuid.UUID]string{}
	for _, failure := range failures {
		messages[failure.ApprovalRequestId] = failure.Message
	}
	return messages
}

func TestSecretApprovalRequest_Batch(t *testing.T) {
	t.Parallel()

	t.Run("should approve the requests the reviewer may act on and report each other one with its reason", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newBatchProject(t)

		// Action
		res, err := p.reviewer.API.BatchReviewSecretApprovalRequestsWithResponse(t.Context(),
			api.BatchReviewSecretApprovalRequestsJSONRequestBody{
				ApprovalRequestIds: []uuid.UUID{p.allowed, p.restricted, p.merged},
				Status:             api.BatchReviewSecretApprovalRequestsJSONBodyStatusApproved,
			})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Len(t, res.JSON200.Reviews, 1)
		require.Equal(t, p.allowed, res.JSON200.Reviews[0].RequestId)
		require.Equal(t, map[uuid.UUID]string{
			p.restricted: "User has insufficient privileges",
			p.merged:     "You can only review open approval requests",
		}, failureMessages(res.JSON200.Failures))
	})

	t.Run("should merge the approved requests the actor may act on and report each other one with its reason", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newBatchProject(t)
		approve(t, p.reviewer, p.allowed)

		// Action
		res, err := p.reviewer.API.BatchMergeSecretApprovalRequestsWithResponse(t.Context(),
			api.BatchMergeSecretApprovalRequestsJSONRequestBody{
				ApprovalRequestIds: []uuid.UUID{p.allowed, p.restricted, p.merged},
			})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.True(t, getRequest(t, p.proj, p.allowed).HasMerged)
		require.Equal(t, map[uuid.UUID]string{
			p.restricted: "User has insufficient privileges",
			p.merged:     "This secret approval request has already been merged.",
		}, failureMessages(res.JSON200.Failures))
		require.Equal(t, "open", getRequest(t, p.proj, p.restricted).Status)
	})
}
