package access_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// addIdentity adds an organization machine identity to Certificate Manager with a role.
func addIdentity(t *testing.T, tn *harness.Tenant, mi *harness.Principal, role string) {
	t.Helper()
	res, err := tn.Admin.API.AddCertManagerIdentityWithResponse(t.Context(), mi.ID, api.AddCertManagerIdentityJSONRequestBody{Role: &role})
	require.NoError(t, err)
	requireOK(t, res.StatusCode(), res.Body, "adding the identity")
}

func TestCertManagerAccess_Identities(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give an added identity the role it was added with", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mi := tn.NewMachineIdentity(t)

		// Action
		addIdentity(t, tn, mi, "member")

		// Assert
		res, err := tn.Admin.API.GetCertManagerIdentityWithResponse(t.Context(), mi.ID)
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the membership returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Len(t, res.JSON200.IdentityMembership.Roles, 1)
		require.Equal(t, "member", res.JSON200.IdentityMembership.Roles[0].Role)
		require.Equal(t, http.StatusOK, listCAsStatus(t, mi))
	})

	t.Run("should list the added identity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mi := tn.NewMachineIdentity(t)
		addIdentity(t, tn, mi, "member")

		// Action
		res, err := tn.Admin.API.ListCertManagerIdentitiesWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing identities returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []string
		for _, m := range res.JSON200.IdentityMemberships {
			ids = append(ids, m.IdentityId)
		}
		require.Equal(t, []string{mi.ID.String()}, ids)
	})

	t.Run("should let an identity promoted to admin create a policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mi := tn.NewMachineIdentity(t)
		addIdentity(t, tn, mi, "member")

		// Action
		res, err := tn.Admin.API.UpdateCertManagerIdentityWithBodyWithResponse(t.Context(), mi.ID, "application/json", rolesBody(t, "admin"))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "updating the identity's role")
		requirePolicyCreated(t, tn, mi)
	})

	t.Run("should stop a removed identity listing the project's CAs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mi := tn.NewMachineIdentity(t)
		addIdentity(t, tn, mi, "member")

		// Action
		res, err := tn.Admin.API.RemoveCertManagerIdentityWithResponse(t.Context(), mi.ID)

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body, "removing the identity")
		require.Equal(t, http.StatusForbidden, listCAsStatus(t, mi))
	})
}
