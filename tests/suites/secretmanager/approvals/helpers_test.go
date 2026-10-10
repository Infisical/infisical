package approvals_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type policyConfig = func(*api.CreateSecretApprovalPolicyJSONRequestBody)

// newPolicy protects dev:/ with one required approval and hard enforcement unless a
// config says otherwise.
func newPolicy(t *testing.T, proj *fixture.Project, approvers []policyMember, configs ...policyConfig) uuid.UUID {
	t.Helper()
	body := api.CreateSecretApprovalPolicyJSONRequestBody{
		ProjectId:        proj.ID,
		Environment:      new("dev"),
		SecretPath:       "/",
		Approvals:        new(float32(1)),
		EnforcementLevel: new(api.CreateSecretApprovalPolicyJSONBodyEnforcementLevelHard),
		Approvers:        approverItems(t, approvers),
	}
	for _, configure := range configs {
		configure(&body)
	}

	res, err := proj.Tenant().Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Approval.Id
}

// policyMember is a user or a group named on a policy as an approver or a bypasser.
type policyMember struct {
	user  *harness.Principal
	group *fixture.Group
}

func userMember(user *harness.Principal) policyMember { return policyMember{user: user} }

func groupMember(group *fixture.Group) policyMember { return policyMember{group: group} }

func bypasserItems(t *testing.T, bypassers []policyMember) *[]api.CreateSecretApprovalPolicyJSONBody_Bypassers_Item {
	t.Helper()
	items := make([]api.CreateSecretApprovalPolicyJSONBody_Bypassers_Item, len(bypassers))
	for i, b := range bypassers {
		if b.group != nil {
			require.NoError(t, items[i].FromCreateSecretApprovalPolicyJSONBodyBypassers0(api.CreateSecretApprovalPolicyJSONBodyBypassers0{
				Type: api.CreateSecretApprovalPolicyJSONBodyBypassers0TypeGroup,
				Id:   b.group.ID.String(),
			}))
			continue
		}
		require.NoError(t, items[i].FromCreateSecretApprovalPolicyJSONBodyBypassers1(api.CreateSecretApprovalPolicyJSONBodyBypassers1{
			Type: api.CreateSecretApprovalPolicyJSONBodyBypassers1TypeUser,
			Id:   new(b.user.ID.String()),
		}))
	}
	return &items
}

func approverItems(t *testing.T, approvers []policyMember) []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item {
	t.Helper()
	items := make([]api.CreateSecretApprovalPolicyJSONBody_Approvers_Item, len(approvers))
	for i, a := range approvers {
		if a.group != nil {
			require.NoError(t, items[i].FromCreateSecretApprovalPolicyJSONBodyApprovers0(api.CreateSecretApprovalPolicyJSONBodyApprovers0{
				Type: api.CreateSecretApprovalPolicyJSONBodyApprovers0TypeGroup,
				Id:   a.group.ID.String(),
			}))
			continue
		}
		require.NoError(t, items[i].FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
			Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
			Id:   new(a.user.ID.String()),
		}))
	}
	return items
}

// policyAt is the policy that governs a path, or nil when writes there go straight through.
func policyAt(t *testing.T, proj *fixture.Project, env, secretPath string) *uuid.UUID {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretApprovalPolicyBoardWithResponse(t.Context(),
		&api.GetSecretApprovalPolicyBoardParams{ProjectId: proj.ID, Environment: env, SecretPath: secretPath})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the policy for %s:%s returned %d: %s",
		env, secretPath, res.StatusCode(), apierr.Body(res.Body))
	if res.JSON200.Policy == nil {
		return nil
	}
	return &res.JSON200.Policy.Id
}

type change struct {
	Op  string
	Key string
}

type request struct {
	ID           uuid.UUID
	Status       string
	HasMerged    bool
	Changes      []change
	Conflicts    any
	BypassReason string
}

// heldRequest fails unless a write's reply says it was held, then reads the request
// it names from the approvals API, so the test asserts what was stored rather than
// what the reply claimed.
func heldRequest(t *testing.T, proj *fixture.Project, replyBody []byte) request {
	t.Helper()
	var reply struct {
		Approval *struct {
			ID uuid.UUID `json:"id"`
		} `json:"approval"`
	}
	require.NoErrorf(t, json.Unmarshal(replyBody, &reply), "reading the write's reply: %s", replyBody)
	require.NotNilf(t, reply.Approval, "write was applied, not held: %s", replyBody)
	return getRequest(t, proj, reply.Approval.ID)
}

func getRequest(t *testing.T, proj *fixture.Project, id uuid.UUID) request {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretApprovalRequestWithResponse(t.Context(), id)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading request %s returned %d: %s", id, res.StatusCode(), apierr.Body(res.Body))

	approval := res.JSON200.Approval
	held := request{ID: approval.Id, Conflicts: approval.Conflicts}
	if approval.Status != nil {
		held.Status = *approval.Status
	}
	if approval.HasMerged != nil {
		held.HasMerged = *approval.HasMerged
	}
	if approval.BypassReason != nil {
		held.BypassReason = *approval.BypassReason
	}
	for _, commit := range approval.Commits {
		held.Changes = append(held.Changes, change{Op: commit.Op, Key: commit.SecretKey})
	}
	return held
}

func openRequestCount(t *testing.T, proj *fixture.Project) int {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetSecretApprovalRequestCountWithResponse(t.Context(),
		&api.GetSecretApprovalRequestCountParams{ProjectId: proj.ID})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "counting requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	if res.JSON200.Approvals.Open == nil {
		return 0
	}
	return int(*res.JSON200.Approvals.Open)
}

// protectedProject is a project whose dev:/ is under a policy, with a committer who
// writes and a separate reviewer the policy names.
type protectedProject struct {
	tn        *harness.Tenant
	proj      *fixture.Project
	committer *harness.Principal
	reviewer  *harness.Principal
	policyID  uuid.UUID
}

func newProtectedProject(t *testing.T, configs ...policyConfig) protectedProject {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
	reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
	policyID := newPolicy(t, proj, []policyMember{userMember(reviewer)}, configs...)
	return protectedProject{tn: tn, proj: proj, committer: committer, reviewer: reviewer, policyID: policyID}
}

func approve(t *testing.T, reviewer *harness.Principal, id uuid.UUID) {
	t.Helper()
	res, err := reviewer.API.ReviewSecretApprovalRequestWithResponse(t.Context(), id,
		api.ReviewSecretApprovalRequestJSONRequestBody{Status: api.Approved})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "approving %s returned %s", id, apierr.Body(res.Body))
}

func merge(t *testing.T, actor *harness.Principal, id uuid.UUID) {
	t.Helper()
	res, err := actor.API.MergeSecretApprovalRequestWithResponse(t.Context(), id, api.MergeSecretApprovalRequestJSONRequestBody{})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "merging %s returned %s", id, apierr.Body(res.Body))
}

func createSecret(t *testing.T, actor *harness.Principal, proj *fixture.Project, name, value string) *api.CreateSecretV4Response {
	t.Helper()
	res, err := actor.API.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId: proj.ID, Environment: "dev", SecretValue: value,
	})
	require.NoError(t, err)
	return res
}
