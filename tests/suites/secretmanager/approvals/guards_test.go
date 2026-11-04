package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func removeUser(t *testing.T, proj *fixture.Project, user *harness.Principal) *api.RemoveProjectMembersResponse {
	t.Helper()
	res, err := proj.Tenant().Admin.API.RemoveProjectMembersWithResponse(t.Context(), proj.ID,
		api.RemoveProjectMembersJSONRequestBody{Usernames: &[]string{user.Email}})
	require.NoError(t, err)
	return res
}

func removeGroup(t *testing.T, proj *fixture.Project, group *fixture.Group) *api.RemoveProjectGroupMembershipResponse {
	t.Helper()
	res, err := proj.Tenant().Admin.API.RemoveProjectGroupMembershipWithResponse(t.Context(), proj.ID, group.ID)
	require.NoError(t, err)
	return res
}

func deleteSecretPolicy(t *testing.T, proj *fixture.Project, policyID uuid.UUID) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.DeleteSecretApprovalPolicyWithResponse(t.Context(), policyID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the policy returned %s", apierr.Body(res.Body))
}

func named(name string) policyConfig {
	return func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.Name = new(name) }
}

func TestSecretApprovalPolicy_MembershipGuard(t *testing.T) {
	t.Parallel()

	t.Run("should refuse removing a user approver from the project until the policy is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, named("dev-changes"))

		// Action
		blocked := removeUser(t, p.proj, p.reviewer)

		// Assert
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t, "Cannot remove user from project: user is an approver in secret approval policy: dev-changes",
			blocked.JSON400.Message)
		deleteSecretPolicy(t, p.proj, p.policyID)
		require.Equalf(t, http.StatusOK, removeUser(t, p.proj, p.reviewer).StatusCode(), "removing after the policy is gone failed")
	})

	t.Run("should refuse removing a group approver from the project until the policy is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewers := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, reviewers)
		policyID := newPolicy(t, proj, []policyMember{groupMember(reviewers)}, named("dev-changes"))

		// Action
		blocked := removeGroup(t, proj, reviewers)

		// Assert
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t, "Cannot remove group from project: group is an approver in secret approval policy: dev-changes",
			blocked.JSON400.Message)
		deleteSecretPolicy(t, proj, policyID)
		require.Equal(t, http.StatusOK, removeGroup(t, proj, reviewers).StatusCode())
	})

	t.Run("should refuse removing a user an open request names after the policy's approvers change, until it closes", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		replacement := p.proj.NewUser(t, fixture.WithPrincipalName("replacement"))
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		replaceApprovers(t, p.proj, p.policyID, []policyMember{userMember(replacement)})

		// Action
		blocked := removeUser(t, p.proj, p.reviewer)

		// Assert
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t,
			"Cannot remove user from project: user is an approver on open secret approval request: "+requestSlug(t, p.proj, held.ID),
			blocked.JSON400.Message)
		closeRequest(t, p.committer, held.ID)
		require.Equal(t, http.StatusOK, removeUser(t, p.proj, p.reviewer).StatusCode())
	})

	t.Run("should refuse removing a group an open request names after the policy's approvers change, until it closes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		replacement := proj.NewUser(t, fixture.WithPrincipalName("replacement"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, tn.NewUser(t, harness.WithName("grouped")))
		proj.GrantGroup(t, reviewers)
		policyID := newPolicy(t, proj, []policyMember{groupMember(reviewers)})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)
		replaceApprovers(t, proj, policyID, []policyMember{userMember(replacement)})

		// Action
		blocked := removeGroup(t, proj, reviewers)

		// Assert
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t,
			"Cannot remove group from project: group is an approver on open secret approval request: "+requestSlug(t, proj, held.ID),
			blocked.JSON400.Message)
		closeRequest(t, committer, held.ID)
		require.Equal(t, http.StatusOK, removeGroup(t, proj, reviewers).StatusCode())
	})
}

func TestSecretApprovalRequest_FolderGuard(t *testing.T) {
	t.Parallel()

	deleteFolder := func(t *testing.T, proj *fixture.Project, parent, name string) *api.DeleteSecretFolderResponse {
		t.Helper()
		res, err := proj.Tenant().Admin.API.DeleteSecretFolderWithResponse(t.Context(), name, api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new(parent), ForceDelete: new(true),
		})
		require.NoError(t, err)
		return res
	}

	t.Run("should refuse deleting a folder with an open request, directly or through its parent, until it closes", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.SecretPath = "/parent/child" })
		secretmanager.CreateFolder(t, p.proj, "dev", "/parent/child")
		res, err := p.committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: p.proj.ID, Environment: "dev", SecretPath: new("/parent/child"), SecretValue: "value",
		})
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		want := `You cannot delete the selected folder because it has open change requests at folder path "/parent/child". Merge or close the change requests and try again.`

		// Action
		child := deleteFolder(t, p.proj, "/parent", "child")
		parent := deleteFolder(t, p.proj, "/", "parent")

		// Assert
		require.Equal(t, http.StatusBadRequest, child.StatusCode())
		require.Equal(t, want, child.JSON400.Message)
		require.Equal(t, http.StatusBadRequest, parent.StatusCode())
		require.Equal(t, want, parent.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev", secretmanager.WithPath("/parent/child")),
			"the child folder is gone or holds the secret")
		closeRequest(t, p.committer, held.ID)
		require.Equal(t, http.StatusOK, deleteFolder(t, p.proj, "/", "parent").StatusCode())
	})
}
