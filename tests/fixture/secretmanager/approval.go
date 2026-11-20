package secretmanager

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// CreateApprovalPolicy puts a secret change policy on one folder, with approver as its
// only approver and one approval required. It returns the policy's name, which refusal
// messages quote.
func CreateApprovalPolicy(tt *testing.T, p *fixture.Project, at Location, approver *harness.Principal) string {
	tt.Helper()
	var item api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
	require.NoError(tt, item.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
		Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
		Id:   new(approver.ID.String()),
	}))
	name := "policy-" + id.Short()
	res, err := p.Tenant().Admin.API.CreateSecretApprovalPolicyWithResponse(tt.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
		ProjectId:   p.ID,
		Name:        &name,
		Environment: &at.Env,
		SecretPath:  at.Path,
		Approvals:   new(float32(1)),
		Approvers:   []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{item},
	})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "creating a policy on %s:%s returned %d: %s",
		at.Env, at.Path, res.StatusCode(), apierr.Body(res.Body))
	return name
}
