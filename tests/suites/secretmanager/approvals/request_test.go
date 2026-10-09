package approvals_test

import (
	"encoding/json"
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// seededProject is a project with secrets written before its dev:/ policy exists, for
// tests about changing what is already there.
func seededProject(t *testing.T, seed map[string]string) protectedProject {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	for key, value := range seed {
		secretmanager.CreateSecret(t, proj, "dev", key, value)
	}
	committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
	reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
	policyID := newPolicy(t, proj, []policyMember{userMember(reviewer)})
	return protectedProject{tn: tn, proj: proj, committer: committer, reviewer: reviewer, policyID: policyID}
}

func valuesIn(t *testing.T, proj *fixture.Project, env string) map[string]string {
	t.Helper()
	values := map[string]string{}
	for _, s := range secretmanager.ListSecrets(t, proj, env) {
		values[s.Key] = s.Value
	}
	return values
}

func TestSecretApprovalRequest_Merge(t *testing.T) {
	t.Parallel()

	t.Run("should create the secret and close the request once approved and merged", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		merged := getRequest(t, p.proj, held.ID)
		require.True(t, merged.HasMerged)
		require.Equal(t, "close", merged.Status)
		require.Equal(t, "value", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
	})

	t.Run("should apply a held update on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := seededProject(t, map[string]string{"API_KEY": "old"})
		res, err := p.committer.API.UpdateSecretV4WithResponse(t.Context(), "API_KEY", api.UpdateSecretV4JSONRequestBody{
			ProjectId: p.proj.ID, Environment: "dev", SecretValue: new("new"),
		})
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		require.Equal(t, []change{{Op: "update", Key: "API_KEY"}}, held.Changes)
		require.Equal(t, "old", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Equal(t, "new", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
	})

	t.Run("should apply a held delete on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := seededProject(t, map[string]string{"API_KEY": "value"})
		res, err := p.committer.API.DeleteSecretV4WithResponse(t.Context(), "API_KEY", api.DeleteSecretV4JSONRequestBody{
			ProjectId: p.proj.ID, Environment: "dev",
		})
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		require.Equal(t, []change{{Op: "delete", Key: "API_KEY"}}, held.Changes)
		require.Equal(t, "value", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})

	t.Run("should hold a batch create as one request and create every secret on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		body := api.CreateManySecretsV4JSONRequestBody{ProjectId: p.proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", "a"
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "B", "b"
		res, err := p.committer.API.CreateManySecretsV4WithResponse(t.Context(), body)
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		require.ElementsMatch(t, []change{{Op: "create", Key: "A"}, {Op: "create", Key: "B"}}, held.Changes)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Equal(t, map[string]string{"A": "a", "B": "b"}, valuesIn(t, p.proj, "dev"))
	})

	t.Run("should hold a batch update as one request and update every secret on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := seededProject(t, map[string]string{"A": "old-a", "B": "old-b"})
		body := api.UpdateManySecretsV4JSONRequestBody{ProjectId: p.proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[0].SecretValue = "A", new("new-a")
		body.Secrets[1].SecretKey, body.Secrets[1].SecretValue = "B", new("new-b")
		res, err := p.committer.API.UpdateManySecretsV4WithResponse(t.Context(), body)
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		require.ElementsMatch(t, []change{{Op: "update", Key: "A"}, {Op: "update", Key: "B"}}, held.Changes)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Equal(t, map[string]string{"A": "new-a", "B": "new-b"}, valuesIn(t, p.proj, "dev"))
	})

	t.Run("should hold a batch delete as one request and delete every secret on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := seededProject(t, map[string]string{"A": "a", "B": "b", "KEPT": "kept"})
		body := api.DeleteManySecretsV4JSONRequestBody{ProjectId: p.proj.ID, Environment: "dev"}
		body.Secrets = slices.Grow(body.Secrets, 2)[:2]
		body.Secrets[0].SecretKey, body.Secrets[1].SecretKey = "A", "B"
		res, err := p.committer.API.DeleteManySecretsV4WithResponse(t.Context(), body)
		require.NoError(t, err)
		held := heldRequest(t, p.proj, res.Body)
		require.ElementsMatch(t, []change{{Op: "delete", Key: "A"}, {Op: "delete", Key: "B"}}, held.Changes)
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Equal(t, map[string]string{"KEPT": "kept"}, valuesIn(t, p.proj, "dev"))
	})

	t.Run("should hold a duplicate into a protected environment and create the copy on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.Environment = new("prod") })
		source := secretmanager.CreateSecret(t, p.proj, "dev", "API_KEY", "value", secretmanager.As(p.committer))
		body := api.DuplicateSecretV4JSONRequestBody{
			ProjectId:              p.proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []uuid.UUID{uuid.MustParse(source.ID)},
		}
		body.AttributesToCopy = &struct {
			Comment               *bool `json:"comment,omitempty"`
			Metadata              *bool `json:"metadata,omitempty"`
			SkipMultilineEncoding *bool `json:"skipMultilineEncoding,omitempty"`
			Tags                  *bool `json:"tags,omitempty"`
			Value                 *bool `json:"value,omitempty"`
		}{Value: new(true)}
		res, err := p.committer.API.DuplicateSecretV4WithResponse(t.Context(), body)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "duplicating returned %s", res.Body)
		var reply struct {
			Results []struct {
				Approval *struct {
					ID uuid.UUID `json:"id"`
				} `json:"approval"`
			} `json:"results"`
		}
		require.NoError(t, json.Unmarshal(res.Body, &reply))
		require.Len(t, reply.Results, 1)
		require.NotNilf(t, reply.Results[0].Approval, "the duplicate was applied, not held: %s", res.Body)
		held := getRequest(t, p.proj, reply.Results[0].Approval.ID)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "prod"))
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		require.Equal(t, "value", secretmanager.GetSecret(t, p.proj, "prod", "API_KEY").Value)
	})

	t.Run("should hold a move into a protected environment and land it on merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) { b.Environment = new("prod") })
		moved := secretmanager.CreateSecret(t, p.proj, "dev", "API_KEY", "value", secretmanager.As(p.committer))
		res, err := p.committer.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              p.proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			SecretIds:              []string{moved.ID},
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), res.Body)
		require.False(t, res.JSON200.IsDestinationUpdated)
		spec.Why(t, `A move's reply carries no request id, so this is the one test that finds its
			request through the project's open requests.`)
		open, err := p.tn.Admin.API.ListSecretApprovalRequestsWithResponse(t.Context(), &api.ListSecretApprovalRequestsParams{
			ProjectId: p.proj.ID, Status: new(api.ListSecretApprovalRequestsParamsStatusOpen),
		})
		require.NoError(t, err)
		require.NotNilf(t, open.JSON200, "listing requests returned %d: %s", open.StatusCode(), open.Body)
		require.Len(t, open.JSON200.Approvals, 1)
		requestID := open.JSON200.Approvals[0].Id
		approve(t, p.reviewer, requestID)

		// Action
		merge(t, p.committer, requestID)

		// Assert
		require.Equal(t, "value", secretmanager.GetSecret(t, p.proj, "prod", "API_KEY").Value)
	})

	t.Run("should record a conflict and keep the newer value when the key was written while the request was open", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.BypassForMachineIdentities = new(true)
		})
		bypasser := p.proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "proposed").Body)
		secretmanager.CreateSecret(t, p.proj, "dev", "API_KEY", "written-meanwhile", secretmanager.As(bypasser))
		approve(t, p.reviewer, held.ID)

		// Action
		merge(t, p.committer, held.ID)

		// Assert
		merged := getRequest(t, p.proj, held.ID)
		require.True(t, merged.HasMerged)
		require.NotEmpty(t, merged.Conflicts, "the merge skipped the create without recording why")
		require.Equal(t, "written-meanwhile", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
	})
}

func TestSecretApprovalRequest_Notify(t *testing.T) {
	t.Parallel()

	t.Run("should email the user approver and each member of an approver group when a request opens", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		grouped := tn.NewUser(t, harness.WithName("grouped"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, grouped)
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{userMember(reviewer), groupMember(reviewers)})

		// Action
		heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Assert
		tn.Mail(t).Expect(t, reviewer.Email, smtp.Subject("Infisical Secret Change Request"))
		tn.Mail(t).Expect(t, grouped.Email, smtp.Subject("Infisical Secret Change Request"))
	})
}

func TestSecretApprovalRequest_Review(t *testing.T) {
	t.Parallel()

	reviewAs := func(t *testing.T, actor *harness.Principal, id uuid.UUID, status api.ReviewSecretApprovalRequestJSONBodyStatus) *api.ReviewSecretApprovalRequestResponse {
		t.Helper()
		res, err := actor.API.ReviewSecretApprovalRequestWithResponse(t.Context(), id,
			api.ReviewSecretApprovalRequestJSONRequestBody{Status: status})
		require.NoError(t, err)
		return res
	}
	mergeAs := func(t *testing.T, actor *harness.Principal, id uuid.UUID) *api.MergeSecretApprovalRequestResponse {
		t.Helper()
		res, err := actor.API.MergeSecretApprovalRequestWithResponse(t.Context(), id, api.MergeSecretApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		return res
	}

	t.Run("should refuse a merge without enough approvals and leave the request open", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)

		// Action
		res := mergeAs(t, p.committer, held.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Doesn't have minimum approvals needed", res.JSON400.Message)
		require.Equal(t, "open", getRequest(t, p.proj, held.ID).Status)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})

	t.Run("should not count a rejection toward the required approvals", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		require.Equal(t, http.StatusOK, reviewAs(t, p.reviewer, held.ID, api.Rejected).StatusCode())

		// Action
		res := mergeAs(t, p.committer, held.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Doesn't have minimum approvals needed", res.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})

	t.Run("should refuse a review from a project member who is neither approver nor committer", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		bystander := p.proj.NewUser(t, fixture.WithPrincipalName("bystander"))
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)

		// Action
		res := reviewAs(t, bystander, held.ID, api.Approved)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "User has insufficient privileges", res.JSON403.Message)
		require.Equal(t, http.StatusBadRequest, mergeAs(t, p.committer, held.ID).StatusCode(),
			"the refused review still counted toward the merge")
	})

	t.Run("should refuse the committer reviewing their own request when self-approval is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, committer)
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{groupMember(reviewers)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.AllowedSelfApprovals = new(false)
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		res := reviewAs(t, committer, held.ID, api.Approved)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Failed to review secret approval request. Users are not authorized to review their own request.",
			res.JSON400.Message)
		require.Equal(t, http.StatusBadRequest, mergeAs(t, committer, held.ID).StatusCode())
	})

	t.Run("should let a member of an approver group approve a request into a merge", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		grouped := tn.NewUser(t, harness.WithName("grouped"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, grouped)
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{groupMember(reviewers)})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)

		// Action
		approve(t, grouped, held.ID)
		merge(t, committer, held.ID)

		// Assert
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should need two different group members when two approvals are required", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		first, second := tn.NewUser(t, harness.WithName("first")), tn.NewUser(t, harness.WithName("second"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, first, second)
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{groupMember(reviewers)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Approvals = new(float32(2))
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)
		approve(t, first, held.ID)
		approve(t, first, held.ID)

		// Action
		refused := mergeAs(t, committer, held.ID)
		approve(t, second, held.ID)
		merged := mergeAs(t, committer, held.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, refused.StatusCode(), "one member approving twice counted as two approvals")
		require.Equalf(t, http.StatusOK, merged.StatusCode(), "merging after two approvals returned %s", merged.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY").Value)
	})

	t.Run("should count one approval once when the approver is named directly and through a group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := harness.From(t).NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		other := tn.NewUser(t, harness.WithName("other"))
		reviewers := fixture.NewGroup(t, tn)
		reviewers.AddUser(t, reviewer, other)
		proj.GrantGroup(t, reviewers)
		newPolicy(t, proj, []policyMember{userMember(reviewer), groupMember(reviewers)}, func(b *api.CreateSecretApprovalPolicyJSONRequestBody) {
			b.Approvals = new(float32(2))
		})
		held := heldRequest(t, proj, createSecret(t, committer, proj, "API_KEY", "value").Body)
		approve(t, reviewer, held.ID)

		// Action
		refused := mergeAs(t, committer, held.ID)
		approve(t, other, held.ID)
		merged := mergeAs(t, committer, held.ID)

		// Assert
		require.Equalf(t, http.StatusBadRequest, refused.StatusCode(),
			"one person's approval satisfied a two-approval policy: %s", refused.Body)
		require.Equalf(t, http.StatusOK, merged.StatusCode(), "merging after a second approver returned %s", merged.Body)
	})
}

func TestSecretApprovalRequest_Status(t *testing.T) {
	t.Parallel()

	setStatus := func(t *testing.T, actor *harness.Principal, id uuid.UUID, status api.UpdateSecretApprovalRequestStatusJSONBodyStatus) *api.UpdateSecretApprovalRequestStatusResponse {
		t.Helper()
		res, err := actor.API.UpdateSecretApprovalRequestStatusWithResponse(t.Context(), id,
			api.UpdateSecretApprovalRequestStatusJSONRequestBody{Status: status})
		require.NoError(t, err)
		return res
	}

	t.Run("should refuse review and merge of a closed request and allow both once it is reopened", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		require.Equal(t, http.StatusOK, setStatus(t, p.committer, held.ID, api.UpdateSecretApprovalRequestStatusJSONBodyStatusClose).StatusCode())

		// Action
		review, err := p.reviewer.API.ReviewSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.ReviewSecretApprovalRequestJSONRequestBody{Status: api.Approved})
		require.NoError(t, err)
		mergeClosed, err := p.committer.API.MergeSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.MergeSecretApprovalRequestJSONRequestBody{})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusBadRequest, review.StatusCode())
		require.Equal(t, "You can only review open approval requests", review.JSON400.Message)
		require.Equal(t, http.StatusBadRequest, mergeClosed.StatusCode())
		require.Equal(t, "You can only approve or reject open approval requests", mergeClosed.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))

		require.Equal(t, http.StatusOK, setStatus(t, p.committer, held.ID, api.UpdateSecretApprovalRequestStatusJSONBodyStatusOpen).StatusCode())
		approve(t, p.reviewer, held.ID)
		merge(t, p.committer, held.ID)
		require.Equal(t, "value", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
	})

	t.Run("should refuse closing a request that is already closed", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		require.Equal(t, http.StatusOK, setStatus(t, p.committer, held.ID, api.UpdateSecretApprovalRequestStatusJSONBodyStatusClose).StatusCode())

		// Action
		res := setStatus(t, p.committer, held.ID, api.UpdateSecretApprovalRequestStatusJSONBodyStatusClose)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Approval request is already closed", res.JSON400.Message)
		require.Equal(t, "close", getRequest(t, p.proj, held.ID).Status)
	})

	t.Run("should refuse a merge once the policy has been deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := newProtectedProject(t)
		held := heldRequest(t, p.proj, createSecret(t, p.committer, p.proj, "API_KEY", "value").Body)
		approve(t, p.reviewer, held.ID)
		deleted, err := p.tn.Admin.API.DeleteSecretApprovalPolicyWithResponse(t.Context(), p.policyID.String())
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, deleted.StatusCode())

		// Action
		res, err := p.committer.API.MergeSecretApprovalRequestWithResponse(t.Context(), held.ID,
			api.MergeSecretApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "The policy associated with this secret approval request has been deleted.", res.JSON400.Message)
		require.Empty(t, secretmanager.ListSecrets(t, p.proj, "dev"))
	})
}

func TestSecretApprovalRequest_Propose(t *testing.T) {
	t.Parallel()

	t.Run("should refuse proposing a secret that already exists and open no request", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := seededProject(t, map[string]string{"API_KEY": "original"})

		// Action
		res := createSecret(t, p.committer, p.proj, "API_KEY", "proposed")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret already exists: 'API_KEY' in path '/' of environment 'dev'", res.JSON400.Message)
		require.Zero(t, openRequestCount(t, p.proj))
		require.Equal(t, "original", secretmanager.GetSecret(t, p.proj, "dev", "API_KEY").Value)
	})
}
