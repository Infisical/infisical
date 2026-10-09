package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretApprovalPolicy_Enforce(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hold a write to the protected path as an open request and leave the secret unwritten", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		newPolicy(t, proj, []policyMember{userMember(reviewer)})

		// Action
		res := createSecret(t, committer, proj, "API_KEY", "value")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "writing returned %s", res.Body)
		held := heldRequest(t, proj, res.Body)
		require.Equal(t, "open", held.Status)
		require.Equal(t, []change{{Op: "create", Key: "API_KEY"}}, held.Changes)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should write directly when the path is outside the policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		secretmanager.CreateFolder(t, proj, "dev", "/guarded")
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.SecretPath = "/guarded"
		})

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.As(committer))

		// Assert
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
		require.Zero(t, openRequestCount(t, proj))
	})

	t.Run("should hold a write in a nested folder that a glob policy matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.SecretPath = "/app/*"
		})

		// Action
		res, err := committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/app/api"), SecretValue: "value",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, []change{{Op: "create", Key: "API_KEY"}}, heldRequest(t, proj, res.Body).Changes)
	})

	t.Run("should govern a path with its exact policy over a glob that also matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		newPolicy(t, proj, []policyMember{userMember(reviewer)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.SecretPath = "/app/*"
		})

		// Action
		exact := newPolicy(t, proj, []policyMember{userMember(reviewer)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.SecretPath = "/app/api"
		})

		// Assert
		governing := policyAt(t, proj, "dev", "/app/api")
		require.NotNil(t, governing)
		require.Equal(t, exact, *governing)
	})

	t.Run("should hold a write when the approver is a group in the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, tn.NewUser(t, harness.WithName("reviewer")))
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{groupMember(reviewers)})

		// Action
		res := createSecret(t, committer, proj, "API_KEY", "value")

		// Assert
		require.Equal(t, []change{{Op: "create", Key: "API_KEY"}}, heldRequest(t, proj, res.Body).Changes)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"))
	})

	t.Run("should keep enforcing an existing policy after the plan loses approvals", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		newPolicy(t, proj, []policyMember{userMember(reviewer)})
		tn.SetPlan(t, license.Enterprise().Without(license.SecretApproval))

		// Action
		res := createSecret(t, committer, proj, "API_KEY", "value")

		// Assert
		heldRequest(t, proj, res.Body)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "dev"), "a license check must never change what a policy enforces")
	})
}

func TestSecretApprovalPolicy_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse more required approvals than approvers and create no policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvals:   new(float32(2)),
			Approvers:   approverItems(t, []policyMember{userMember(reviewer)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Approvals cannot be greater than approvers", res.JSON400.Message)
		require.Nil(t, policyAt(t, proj, "dev", "/"))
	})

	t.Run("should allow more required approvals than listed approvers when one is a group", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A group's size is not fixed, so the approvals count is not checked against it.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, tn.NewUser(t, harness.WithName("reviewer")))
		proj.GrantGroup(t, reviewers)

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvals:   new(float32(2)),
			Approvers:   approverItems(t, []policyMember{groupMember(reviewers)}),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, res.JSON200.Approval.Id, *policyAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a second policy on the same path and environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		first := newPolicy(t, proj, []policyMember{userMember(reviewer)})

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvers:   approverItems(t, []policyMember{userMember(reviewer)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "A policy for secret path '/' already exists in environment 'dev'", res.JSON400.Message)
		require.Equal(t, first, *policyAt(t, proj, "dev", "/"))
	})

	t.Run("should accept a user approver who is in the project only through a group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viaGroup := tn.NewUser(t, harness.WithName("via-group"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, viaGroup)
		proj.GrantGroup(t, reviewers)

		// Action
		policyID := newPolicy(t, proj, []policyMember{userMember(viaGroup)})

		// Assert
		require.Equal(t, policyID, *policyAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a user approver who is not a member of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := tn.NewUser(t, harness.WithName("outsider"))

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvers:   approverItems(t, []policyMember{userMember(outsider)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, "Some users are not members of the project")
		require.Nil(t, policyAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a group approver that is not a member of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsiders := fixture.NewGroup(t, tn)
		outsiders.AddUser(t, tn.NewUser(t, harness.WithName("outsider")))

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvers:   approverItems(t, []policyMember{groupMember(outsiders)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, "Some groups are not members of the project")
		require.Nil(t, policyAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a project member without permission to manage policies", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		res, err := member.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvers:   approverItems(t, []policyMember{userMember(reviewer)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "a member created a policy: %s", res.Body)
		require.Nil(t, policyAt(t, proj, "dev", "/"))
	})

	t.Run("should refuse a policy when the plan does not include it, leaving writes direct", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretApproval)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))

		// Action
		res, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("dev"),
			SecretPath:  "/",
			Approvers:   approverItems(t, []policyMember{userMember(reviewer)}),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Failed to create secret approval policy due to plan restriction. Upgrade plan to create secret approval policy.",
			res.JSON400.Message)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.As(committer))
	})
}

func TestSecretApprovalPolicy_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should close the policy's open requests and let writes through once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		policyID := newPolicy(t, proj, []policyMember{userMember(reviewer)})
		pending := heldRequest(t, proj, createSecret(t, committer, proj, "PENDING", "value").Body)

		// Action
		res, err := tn.Admin.API.DeleteSecretApprovalPolicyWithResponse(t.Context(), policyID.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the policy returned %s", res.Body)

		// Assert
		require.Equal(t, "close", getRequest(t, proj, pending.ID).Status)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.As(committer))
	})
}
