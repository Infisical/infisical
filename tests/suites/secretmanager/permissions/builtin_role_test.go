package permissions_test

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
	"github.com/stretchr/testify/require"
)

func TestBuiltInRole_SecretRoutes(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// sweep calls every main secret route once as pr and returns each status by route.
	sweep := func(t *testing.T, pr *harness.Principal, proj *fixture.Project) map[string]int {
		t.Helper()
		return map[string]int{
			"list":   listSecrets(t, pr, proj, "dev", "/", false).status,
			"get":    readSecret(t, pr, proj, "dev", "/", "API_KEY").StatusCode(),
			"create": createSecret(t, pr, proj, "dev", "/", "NEW_KEY", "new").StatusCode(),
			"update": updateSecret(t, pr, proj, "dev", "/", "API_KEY",
				api.UpdateSecretV4JSONRequestBody{SecretValue: new("changed")}).StatusCode(),
			"delete": deleteSecret(t, pr, proj, "dev", "/", "OLD_KEY").StatusCode(),
		}
	}

	t.Run("should give a viewer names and values but no writes", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		secretmanager.CreateSecret(t, proj, "dev", "OLD_KEY", "old")
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		statuses := sweep(t, viewer, proj)

		// Assert
		require.Equal(t, map[string]int{
			"list": http.StatusOK, "get": http.StatusOK,
			"create": http.StatusForbidden, "update": http.StatusForbidden, "delete": http.StatusForbidden,
		}, statuses)
		require.Equal(t, "value", listSecrets(t, viewer, proj, "dev", "/", false).values["API_KEY"])
		require.Equal(t, map[string]string{"API_KEY": "value", "OLD_KEY": "old"}, secretsAt(t, proj, "dev", "/"))
	})

	t.Run("should give a member full secret crud but no policy management", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		secretmanager.CreateSecret(t, proj, "dev", "OLD_KEY", "old")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))

		// Action
		statuses := sweep(t, member, proj)
		policy := createApprovalPolicy(t, member, proj, tn.Admin)
		role := createRole(t, member, proj, "member-made", allow("secrets", "describeSecret"))

		// Assert
		require.Equal(t, map[string]int{
			"list": http.StatusOK, "get": http.StatusOK,
			"create": http.StatusOK, "update": http.StatusOK, "delete": http.StatusOK,
		}, statuses)
		require.Equal(t, map[string]string{"API_KEY": "changed", "NEW_KEY": "new"}, secretsAt(t, proj, "dev", "/"))
		require.Equalf(t, http.StatusForbidden, policy.StatusCode(), "creating a policy as a member: %s", apierr.Body(policy.Body))
		require.Equalf(t, http.StatusForbidden, role.StatusCode(), "creating a role as a member: %s", apierr.Body(role.Body))
	})

	t.Run("should refuse no-access on every secrets route", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value")
		secretmanager.CreateSecret(t, proj, "dev", "OLD_KEY", "old")
		outsider := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		statuses := sweep(t, outsider, proj)

		// Assert
		require.Equal(t, map[string]int{
			"list": http.StatusForbidden, "get": http.StatusForbidden,
			"create": http.StatusForbidden, "update": http.StatusForbidden, "delete": http.StatusForbidden,
		}, statuses)
		require.Equal(t, map[string]string{"API_KEY": "value", "OLD_KEY": "old"}, secretsAt(t, proj, "dev", "/"))
	})
}

func createApprovalPolicy(t *testing.T, actor *harness.Principal, proj *fixture.Project, approver *harness.Principal) *api.CreateSecretApprovalPolicyResponse {
	t.Helper()
	var item api.CreateSecretApprovalPolicyJSONBody_Approvers_Item
	require.NoError(t, item.FromCreateSecretApprovalPolicyJSONBodyApprovers1(api.CreateSecretApprovalPolicyJSONBodyApprovers1{
		Type: api.CreateSecretApprovalPolicyJSONBodyApprovers1TypeUser,
		Id:   new(approver.ID.String()),
	}))
	res, err := actor.API.CreateSecretApprovalPolicyWithResponse(t.Context(), api.CreateSecretApprovalPolicyJSONRequestBody{
		ProjectId:   proj.ID,
		Environment: new("dev"),
		SecretPath:  "/",
		Approvals:   new(float32(1)),
		Approvers:   []api.CreateSecretApprovalPolicyJSONBody_Approvers_Item{item},
	})
	require.NoError(t, err)
	return res
}

func createRole(t *testing.T, actor *harness.Principal, proj *fixture.Project, slug string, permissions ...fixture.Permission) *api.CreateProjectRoleResponse {
	t.Helper()
	body, err := json.Marshal(map[string]any{"slug": slug, "name": slug, "permissions": permissions})
	require.NoError(t, err)
	res, err := actor.API.CreateProjectRoleWithBodyWithResponse(t.Context(), proj.ID, "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	return res
}
