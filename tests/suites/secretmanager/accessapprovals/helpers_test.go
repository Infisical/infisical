package accessapprovals_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

const (
	guardedPath = "/app"
	secretKey   = "API_KEY"
	secretValue = "guarded-value"
)

// reply is a raw response. Policy and request bodies carry unions the generated
// client cannot express, so they are sent and read as JSON.
type reply struct {
	status int
	body   []byte
}

func (r reply) message(t *testing.T) string {
	t.Helper()
	var body struct {
		Message string `json:"message"`
	}
	require.NoErrorf(t, json.Unmarshal(r.body, &body), "reading the error message: %s", apierr.Body(r.body))
	return body.Message
}

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

// approver is a user or a group named on a policy, optionally in a later step.
type approver struct {
	user  *harness.Principal
	group *fixture.Group
	step  int
}

func userApprover(u *harness.Principal) approver { return approver{user: u} }

func groupApprover(g *fixture.Group) approver { return approver{group: g} }

func (a approver) inStep(n int) approver { a.step = n; return a }

func subjects(list []approver) []map[string]any {
	out := make([]map[string]any, 0, len(list))
	for _, a := range list {
		item := map[string]any{"type": "user"}
		if a.group != nil {
			item = map[string]any{"type": "group", "id": a.group.ID.String()}
		} else {
			item["id"] = a.user.ID.String()
		}
		if a.step > 0 {
			item["sequence"] = a.step
		}
		out = append(out, item)
	}
	return out
}

type policyBody map[string]any

// policyFor protects dev at secretPath with one required approval.
func policyFor(proj *fixture.Project, secretPath string, approvers ...approver) policyBody {
	return policyBody{
		"projectSlug": proj.Slug,
		"environment": "dev",
		"secretPath":  secretPath,
		"approvers":   subjects(approvers),
		"approvals":   1,
	}
}

func createPolicyAs(t *testing.T, actor *harness.Principal, body policyBody) reply {
	t.Helper()
	res, err := actor.API.CreateAccessApprovalPolicyWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, body))
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func newPolicy(t *testing.T, proj *fixture.Project, body policyBody) string {
	t.Helper()
	created := createPolicyAs(t, proj.Tenant().Admin, body)
	require.Equalf(t, http.StatusOK, created.status, "creating the policy: %s", apierr.Body(created.body))
	var out struct {
		Approval struct {
			ID string `json:"id"`
		} `json:"approval"`
	}
	require.NoError(t, json.Unmarshal(created.body, &out))
	return out.Approval.ID
}

// updatePolicy sends a PATCH. The route requires the approvers on every update.
func updatePolicy(t *testing.T, proj *fixture.Project, policyID string, body policyBody) reply {
	t.Helper()
	res, err := proj.Tenant().Admin.API.UpdateAccessApprovalPolicyWithBodyWithResponse(t.Context(), policyID,
		"application/json", jsonBody(t, body))
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

type policySubject struct {
	Type              string `json:"type"`
	ID                string `json:"id"`
	Name              string `json:"name"`
	Sequence          int    `json:"sequence"`
	ApprovalsRequired int    `json:"approvalsRequired"`
}

type policyView struct {
	ID                   string  `json:"id"`
	Name                 string  `json:"name"`
	SecretPath           string  `json:"secretPath"`
	Approvals            int     `json:"approvals"`
	AllowedSelfApprovals bool    `json:"allowedSelfApprovals"`
	MaxTimePeriod        *string `json:"maxTimePeriod"`
	Environments         []struct {
		Slug string `json:"slug"`
	} `json:"environments"`
	Approvers []policySubject `json:"approvers"`
	Bypassers []policySubject `json:"bypassers"`
}

// getPolicy reads a policy, or reports nil with the status when it cannot be read.
func getPolicy(t *testing.T, proj *fixture.Project, policyID string) (*policyView, int) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetAccessApprovalPolicyWithResponse(t.Context(), policyID)
	require.NoError(t, err)
	if res.StatusCode() != http.StatusOK {
		return nil, res.StatusCode()
	}
	var out struct {
		Approval policyView `json:"approval"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return &out.Approval, res.StatusCode()
}

func mustGetPolicy(t *testing.T, proj *fixture.Project, policyID string) policyView {
	t.Helper()
	policy, status := getPolicy(t, proj, policyID)
	require.NotNilf(t, policy, "reading policy %s returned %d", policyID, status)
	return *policy
}

func policyIDs(t *testing.T, proj *fixture.Project) []string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListAccessApprovalPoliciesWithResponse(t.Context(),
		&api.ListAccessApprovalPoliciesParams{ProjectSlug: proj.Slug})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing policies: %s", apierr.Body(res.Body))
	var out struct {
		Approvals []policyView `json:"approvals"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	ids := make([]string, 0, len(out.Approvals))
	for _, p := range out.Approvals {
		ids = append(ids, p.ID)
	}
	return ids
}

// readAccess is the packed rule an access request asks for: read on secrets at one
// path in dev.
func readAccess(secretPath string) []any {
	return []any{"read", "secrets", map[string]any{
		"environment": "dev",
		"secretPath":  map[string]any{"$glob": secretPath},
	}}
}

// openAs asks for permanent read access at secretPath unless fields say otherwise.
func openAs(t *testing.T, requester *harness.Principal, proj *fixture.Project, secretPath string, fields map[string]any) reply {
	t.Helper()
	body := map[string]any{"permissions": []any{readAccess(secretPath)}, "isTemporary": false}
	for k, v := range fields {
		body[k] = v
	}
	res, err := requester.API.CreateAccessApprovalRequestWithBodyWithResponse(t.Context(),
		&api.CreateAccessApprovalRequestParams{ProjectSlug: proj.Slug}, "application/json", jsonBody(t, body))
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func openRequest(t *testing.T, requester *harness.Principal, proj *fixture.Project, secretPath string, fields map[string]any) string {
	t.Helper()
	opened := openAs(t, requester, proj, secretPath, fields)
	require.Equalf(t, http.StatusOK, opened.status, "opening a request: %s", apierr.Body(opened.body))
	var out struct {
		Approval struct {
			ID string `json:"id"`
		} `json:"approval"`
	}
	require.NoError(t, json.Unmarshal(opened.body, &out))
	return out.Approval.ID
}

func temporary(rng string) map[string]any {
	return map[string]any{"isTemporary": true, "temporaryRange": rng}
}

func reviewAs(t *testing.T, actor *harness.Principal, requestID, status string, bypassReason ...string) reply {
	t.Helper()
	body := api.ReviewAccessApprovalRequestJSONRequestBody{Status: api.ReviewAccessApprovalRequestJSONBodyStatus(status)}
	if len(bypassReason) > 0 {
		body.BypassReason = &bypassReason[0]
	}
	res, err := actor.API.ReviewAccessApprovalRequestWithResponse(t.Context(), requestID, body)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func approve(t *testing.T, actor *harness.Principal, requestID string) {
	t.Helper()
	res := reviewAs(t, actor, requestID, "approved")
	require.Equalf(t, http.StatusOK, res.status, "%s approving %s: %s", actor.Name, requestID, apierr.Body(res.body))
}

func revokeAs(t *testing.T, actor *harness.Principal, requestID string) reply {
	t.Helper()
	res, err := actor.API.RevokeAccessApprovalRequestWithResponse(t.Context(), requestID)
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

type requestUser struct {
	UserID string `json:"userId"`
}

type requestView struct {
	ID             string  `json:"id"`
	PolicyID       *string `json:"policyId"`
	Status         string  `json:"status"`
	IsApproved     bool    `json:"isApproved"`
	IsTemporary    bool    `json:"isTemporary"`
	TemporaryRange *string `json:"temporaryRange"`
	PrivilegeID    *string `json:"privilegeId"`
	BypassReason   *string `json:"bypassReason"`
	Privilege      *struct {
		IsTemporary    bool    `json:"isTemporary"`
		TemporaryRange *string `json:"temporaryRange"`
	} `json:"privilege"`
	Policy struct {
		ID         *string  `json:"id"`
		SecretPath string   `json:"secretPath"`
		DeletedAt  *string  `json:"deletedAt"`
		Bypassers  []string `json:"bypassers"`
	} `json:"policy"`
	Reviewers []struct {
		UserID string `json:"userId"`
		Status string `json:"status"`
	} `json:"reviewers"`
	RequestedByUser requestUser  `json:"requestedByUser"`
	ApprovedByUser  *requestUser `json:"approvedByUser"`
	RevokedByUser   *requestUser `json:"revokedByUser"`
}

// listRequests reads every request in the project as the administrator, who may see
// all of them.
func listRequests(t *testing.T, proj *fixture.Project) []requestView {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListAccessApprovalRequestsWithResponse(t.Context(),
		&api.ListAccessApprovalRequestsParams{ProjectSlug: proj.Slug})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing requests: %s", apierr.Body(res.Body))
	var out struct {
		Requests []requestView `json:"requests"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.Requests
}

func requestByID(t *testing.T, proj *fixture.Project, requestID string) requestView {
	t.Helper()
	for _, r := range listRequests(t, proj) {
		if r.ID == requestID {
			return r
		}
	}
	require.Failf(t, "request not listed", "request %s is not in the project's list", requestID)
	return requestView{}
}

func statusOf(t *testing.T, proj *fixture.Project, requestID string) string {
	t.Helper()
	return requestByID(t, proj, requestID).Status
}

// readGuarded reads the guarded secret as actor and reports the status.
func readGuarded(t *testing.T, actor *harness.Principal, proj *fixture.Project) int {
	t.Helper()
	res, err := actor.API.GetSecretByNameV4WithResponse(t.Context(), secretKey, &api.GetSecretByNameV4Params{
		ProjectId:       proj.ID,
		Environment:     new("dev"),
		SecretPath:      new(guardedPath),
		ViewSecretValue: new(api.GetSecretByNameV4ParamsViewSecretValue("true")),
	})
	require.NoError(t, err)
	if res.JSON200 != nil && res.JSON200.Secret.SecretValue != secretValue {
		require.Failf(t, "wrong value", "read %q, want %q", res.JSON200.Secret.SecretValue, secretValue)
	}
	return res.StatusCode()
}

// awaitRead waits until actor can or cannot read the guarded secret. Grants land
// in the permission cache up to ten seconds late, in both directions.
// requireNothingGranted checks that a request still short of its approvals has granted
// no privilege and that the requester still cannot read the guarded secret.
func requireNothingGranted(t *testing.T, g guarded, requestID string) {
	t.Helper()
	require.Nil(t, requestByID(t, g.proj, requestID).Privilege, "a pending request already holds a privilege")
	require.Equal(t, http.StatusForbidden, readGuarded(t, g.requester, g.proj))
}

func awaitRead(t *testing.T, actor *harness.Principal, proj *fixture.Project, allowed bool) {
	t.Helper()
	what := "the requester to read the guarded secret"
	if !allowed {
		what = "the requester to lose read access to the guarded secret"
	}
	wait.Until(t, what, func() bool {
		status := readGuarded(t, actor, proj)
		if allowed {
			return status == http.StatusOK
		}
		return status == http.StatusForbidden
	})
}

// guarded is a project whose dev:/app holds one secret under an access policy, a
// requester with no access to it, and a separate approver the policy names.
type guarded struct {
	tn        *harness.Tenant
	proj      *fixture.Project
	requester *harness.Principal
	approver  *harness.Principal
	policyID  string
}

// newProject is the guarded project before any policy exists.
func newProject(t *testing.T) guarded {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	secretmanager.CreateFolder(t, proj, "dev", guardedPath)
	secretmanager.CreateSecret(t, proj, "dev", secretKey, secretValue, secretmanager.WithPath(guardedPath))
	proj.NewRole(t, "requester", fixture.Permission{Subject: "secret-folders", Action: []string{"read"}})
	requester := proj.NewUser(t, fixture.WithPrincipalName("requester"), fixture.WithRoles("requester"))
	approver := proj.NewUser(t, fixture.WithPrincipalName("approver"))
	return guarded{tn: tn, proj: proj, requester: requester, approver: approver}
}

func newGuarded(t *testing.T, configure ...func(policyBody)) guarded {
	t.Helper()
	g := newProject(t)
	body := policyFor(g.proj, guardedPath, userApprover(g.approver))
	for _, c := range configure {
		c(body)
	}
	g.policyID = newPolicy(t, g.proj, body)
	return g
}
