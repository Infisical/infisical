package validation_test

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

func TestSecretValidationRule_Move(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	strictProject := func(t *testing.T) (*harness.Tenant, *fixture.Project) {
		t.Helper()
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/strict")
		secretmanager.CreateFolder(t, proj, "prod", "/lenient")
		newRule(t, proj, "min-length-under-strict", inEnv("prod"), atPath("/strict/**"),
			onValues(valueConstraints{MinLength: new(3)}))
		return tn, proj
	}

	moveSecret := func(t *testing.T, tn *harness.Tenant, proj *fixture.Project, env, from, to, secretID string) *api.MoveSecretsV4Response {
		t.Helper()
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      env,
			SourceSecretPath:       &from,
			DestinationEnvironment: env,
			DestinationSecretPath:  &to,
			SecretIds:              []string{secretID},
		})
		require.NoError(t, err)
		return res
	}

	keysAt := func(t *testing.T, proj *fixture.Project, env, secretPath string) []string {
		t.Helper()
		keys := []string{}
		for _, s := range secretmanager.ListSecrets(t, proj, env, secretmanager.WithPath(secretPath)) {
			keys = append(keys, s.Key)
		}
		return keys
	}

	t.Run("should refuse and move nothing when the secret's value breaks the destination's rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, proj := strictProject(t)
		secret := secretmanager.CreateSecret(t, proj, "prod", "TOO_SHORT", "x", secretmanager.WithPath("/lenient"))

		// Action
		res := moveSecret(t, tn, proj, "prod", "/lenient", "/strict", secret.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "TOO_SHORT": value must be at least 3 characters`)
		require.Equal(t, []string{"TOO_SHORT"}, keysAt(t, proj, "prod", "/lenient"))
		require.Empty(t, keysAt(t, proj, "prod", "/strict"))
	})

	t.Run("should move a secret whose value meets the destination's rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, proj := strictProject(t)
		secret := secretmanager.CreateSecret(t, proj, "prod", "LONG_ENOUGH", "long-enough-value", secretmanager.WithPath("/lenient"))

		// Action
		res := moveSecret(t, tn, proj, "prod", "/lenient", "/strict", secret.ID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "moving returned %s", res.Body)
		require.Equal(t, []string{"LONG_ENOUGH"}, keysAt(t, proj, "prod", "/strict"))
		require.Empty(t, keysAt(t, proj, "prod", "/lenient"))
	})

	t.Run("should refuse and move nothing when a folder holds a secret that breaks the destination's rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, proj := strictProject(t)
		folderID := secretmanager.CreateFolder(t, proj, "prod", "/lenient/short-values")
		secretmanager.CreateSecret(t, proj, "prod", "NESTED_TOO_SHORT", "x", secretmanager.WithPath("/lenient/short-values"))

		// Action
		res, err := tn.Admin.API.MoveSecretFolderWithResponse(t.Context(), api.MoveSecretFolderJSONRequestBody{
			ProjectId:              proj.ID,
			FolderId:               uuid.MustParse(folderID),
			DestinationEnvironment: "prod",
			DestinationPath:        new("/strict"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "NESTED_TOO_SHORT": value must be at least 3 characters`)
		require.Equal(t, []string{"short-values"}, folderNamesAt(t, proj, "prod", "/lenient"))
		require.Empty(t, folderNamesAt(t, proj, "prod", "/strict"))
		require.Equal(t, []string{"NESTED_TOO_SHORT"}, keysAt(t, proj, "prod", "/lenient/short-values"))
	})

	t.Run("should move a secret within a no-duplicates scope that also covers its source", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "staging", "/from")
		secretmanager.CreateFolder(t, proj, "staging", "/to")
		newRule(t, proj, "no-duplicate-values-in-staging", inEnv("staging"), atPath("/**"),
			onValues(valueConstraints{UniqueWithinScope: new(true)}))
		secret := secretmanager.CreateSecret(t, proj, "staging", "MOVED_UNIQUE", "moved-unique-value", secretmanager.WithPath("/from"))

		// Action
		res := moveSecret(t, tn, proj, "staging", "/from", "/to", secret.ID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "moving returned %s", res.Body)
		require.Equal(t, []string{"MOVED_UNIQUE"}, keysAt(t, proj, "staging", "/to"))
		require.Empty(t, keysAt(t, proj, "staging", "/from"))
	})

	t.Run("should refuse and open no change request when the destination has a change policy and the value breaks its rule", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, proj := strictProject(t)
		secretmanager.CreateFolder(t, proj, "prod", "/strict/guarded")
		var approver api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
		require.NoError(t, approver.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
			Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
			Id:   new(tn.Admin.ID.String()),
		}))
		policy, err := tn.Admin.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: new("prod"),
			SecretPath:  "/strict/guarded",
			Approvals:   new(float32(1)),
			Approvers:   []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{approver},
		})
		require.NoError(t, err)
		require.NotNilf(t, policy.JSON200, "creating the policy returned %d: %s", policy.StatusCode(), apierr.Body(policy.Body))
		secret := secretmanager.CreateSecret(t, proj, "prod", "GUARDED_TOO_SHORT", "x", secretmanager.WithPath("/lenient"))

		// Action
		res := moveSecret(t, tn, proj, "prod", "/lenient", "/strict/guarded", secret.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message, `Secret "GUARDED_TOO_SHORT": value must be at least 3 characters`)
		count, err := tn.Admin.API.GetSecretApprovalRequestCountWithResponse(t.Context(),
			&api.GetSecretApprovalRequestCountParams{ProjectId: proj.ID})
		require.NoError(t, err)
		require.NotNilf(t, count.JSON200, "counting requests returned %d: %s", count.StatusCode(), apierr.Body(count.Body))
		if count.JSON200.Approvals.Open != nil {
			require.Zero(t, *count.JSON200.Approvals.Open, "the refused move still opened a change request")
		}
		require.Equal(t, []string{"GUARDED_TOO_SHORT"}, keysAt(t, proj, "prod", "/lenient"))
	})
}
