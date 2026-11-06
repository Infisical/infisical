package sessionbinding_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSessionBinding_SubOrganization(t *testing.T) {
	t.Parallel()

	t.Run("should refuse a sub-org session on the next request once the root org starts enforcing SSO", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		sub := fixture.NewSubOrg(t, other.Tenant)
		join(t, sub.Admin.API, sub.ID, iss.email, "member")
		alice, _ := iss.session(t, iss.login(t), sub.ID)
		status, body := readOrg(t, alice, sub.ID)
		require.Equalf(t, http.StatusOK, status, "reading the sub-org before enforcement: %s", apierr.Body(body))
		other.Enforce(t)

		// Action
		status, body = readOrg(t, alice, sub.ID)

		// Assert
		requireForeignSession(t, status, body)
	})

	t.Run("should refuse a sub-org admin when the root org allows bypass, only a root org role bypasses", func(t *testing.T) {
		t.Parallel()

		// Setup
		iss, other := setup(t, "member")
		sub := fixture.NewSubOrg(t, other.Tenant)
		join(t, sub.Admin.API, sub.ID, iss.email, "admin")
		alice, _ := iss.session(t, iss.login(t), sub.ID)
		other.Enforce(t)

		// Action
		status, body := readOrg(t, alice, sub.ID)

		// Assert
		requireForeignSession(t, status, body)
	})

	t.Run("should refuse a sub-org project read on the next request once the root org admin role is revoked", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "the sub-org project's cached permission doesn't track root org roles")

		// Setup
		iss, other := setup(t, "admin")
		sub := fixture.NewSubOrg(t, other.Tenant)
		join(t, sub.Admin.API, sub.ID, iss.email, "admin")
		alice, _ := iss.session(t, iss.login(t), sub.ID)
		kind := api.CreateProjectJSONBodyType("secret-manager")
		created, err := alice.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{ProjectName: "p-" + id.Short(), Type: &kind})
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a project returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		projectID := created.JSON200.Project.Id
		other.Enforce(t)
		status, body := readProject(t, alice, projectID)
		require.Equalf(t, http.StatusOK, status, "reading the project as a root org admin: %s", apierr.Body(body))
		demoted, err := other.Tenant.Admin.API.UpdateOrgMembershipWithResponse(t.Context(), other.Tenant.OrgID.String(),
			fixture.MembershipOf(t, other.Tenant, iss.email).ID.String(), api.UpdateOrgMembershipJSONRequestBody{Role: new("member")})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, demoted.StatusCode(), "demoting to member: %s", apierr.Body(demoted.Body))

		// Action
		status, body = readProject(t, alice, projectID)

		// Assert
		requireForeignSession(t, status, body)
	})
}
