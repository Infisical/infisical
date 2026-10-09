package approvals_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretApprovalRequest_Bypass(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	soft := func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
		b.EnforcementLevel = new(api.CreateSecretApprovalPolicyJSONBodyEnforcementLevelSoft)
	}
	mergeWithReason := func(t *testing.T, actor *harness.Principal, held request, reason string) *api.MergeSecretApprovalRequestResponse {
		t.Helper()
		res, err := actor.API.MergeSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.MergeSecretApprovalRequestJSONRequestBody{BypassReason: &reason})
		require.NoError(t, err)
		return res
	}

	t.Run("should let a user bypasser merge without approvals under soft enforcement and record why", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, soft, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Bypassers = bypasserItems(t, []policyMember{userMember(committer)})
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		res := mergeWithReason(t, committer, held, "production outage")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "bypassing returned %s", res.Body)
		merged := getRequest(t, proj, held.ID)
		require.True(t, merged.HasMerged)
		require.Equal(t, "production outage", merged.BypassReason)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should let a member of a bypasser group merge without approvals under soft enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		oncall := fixture.NewGroup(t, tn)
		oncall.AddUser(t, committer)
		proj.GrantGroup(t, oncall)
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, soft, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Bypassers = bypasserItems(t, []policyMember{groupMember(oncall)})
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		res := mergeWithReason(t, committer, held, "production outage")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "bypassing returned %s", res.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should refuse a merge without approvals from someone who is not a bypasser", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, soft, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Bypassers = bypasserItems(t, []policyMember{userMember(reviewer)})
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		res := mergeWithReason(t, committer, held, "not mine to skip")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Doesn't have minimum approvals needed", res.JSON400.Message)
		require.Equal(t, "open", getRequest(t, proj, held.ID).Status)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should refuse a bypasser's merge without approvals under hard enforcement", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Bypassers = bypasserItems(t, []policyMember{userMember(committer)})
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		res := mergeWithReason(t, committer, held, "production outage")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Doesn't have minimum approvals needed", res.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})
}

func TestSecretApprovalRequest_MachineIdentityBypass(t *testing.T) {
	t.Parallel()

	bypassIdentities := func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
		b.BypassForMachineIdentities = new(true)
	}

	t.Run("should write a machine identity's single and batch changes directly when identities bypass", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, bypassIdentities)
		identity := p.proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: p.proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", "a"
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "B", "b"

		// Action
		secretmanager.CreateSecret(t, p.proj, "dev", "SINGLE", "single", secretmanager.As(identity))
		res, err := identity.API.CreateManySecretsV4WithResponse(t.Context(), body)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "batch create returned %s", res.Body)
		require.Equal(t, map[string]string{"SINGLE": "single", "A": "a", "B": "b"}, valuesIn(t, p.proj, "dev"))
		require.Zero(t, openRequestCount(t, p.proj))
	})

	t.Run("should still hold a user's write when identities bypass", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, bypassIdentities)

		// Action
		res := createSecret(t, p.committer, p.proj, "API_KEY", "value")

		// Assert
		heldRequest(t, p.proj, res.Body)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})

	t.Run("should hold a machine identity's write once identity bypass is turned off", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, bypassIdentities)
		identity := p.proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		var reviewerItem api.UpdateSecretApprovalPolicyJSONBody_Approvers_Item
		require.NoError(t, reviewerItem.FromUpdateSecretApprovalPolicyJSONBodyApprovers1(api.UpdateSecretApprovalPolicyJSONBodyApprovers1{
			Type: api.UpdateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
			Id:   new(p.reviewer.ID.String()),
		}))
		updated, err := p.tn.Admin.API.UpdateSecretApprovalPolicyWithResponse(t.Context(), p.policyID.String(),
			api.UpdateSecretApprovalPolicyJSONRequestBody{
				Approvers:                  []api.UpdateSecretApprovalPolicyJSONBody_Approvers_Item{reviewerItem},
				BypassForMachineIdentities: new(false),
			})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, updated.StatusCode(), "turning bypass off returned %s", updated.Body)

		// Action
		res := createSecret(t, identity, p.proj, "API_KEY", "value")

		// Assert
		heldRequest(t, p.proj, res.Body)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})

	t.Run("should refuse a machine identity reviewing or merging a request", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		identity := p.proj.NewMachineIdentity(t, fixture.WithRoles("admin"))
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)

		// Action
		review, err := identity.API.ReviewSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.ReviewSecretApprovalRequestJSONRequestBody{Status: api.Approved})
		require.NoError(t, err)
		merged, err := identity.API.MergeSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.MergeSecretApprovalRequestJSONRequestBody{})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusForbidden, review.StatusCode())
		require.Equal(t, http.StatusForbidden, merged.StatusCode())
		require.Equal(t, "open", getRequest(t, p.proj, held.ID).Status)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})
}
