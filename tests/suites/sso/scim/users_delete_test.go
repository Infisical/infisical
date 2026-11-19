package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestScimUser_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should remove the member from the org, its projects and its groups, and keep the account", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		accountID := fixture.MembershipOf(t, s.tn, p.email).UserID
		g := s.provisionGroup(t, "engineering", user.ID)
		proj := fixture.NewProject(t, s.tn)
		proj.GrantGroup(t, asGroup(g))

		// Action
		r := s.deleteUser(t, user.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
		require.Empty(t, s.groupMembers(t, g.ID))
		s.provision(t, p)
		require.Equal(t, accountID, fixture.MembershipOf(t, s.tn, p.email).UserID, "provisioning again should find the same account")
	})

	t.Run("should cut off the member's open session", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		session := s.session(t, p)

		// Action
		r := s.deleteUser(t, user.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		res, err := session.GetOrganizationByIdWithResponse(t.Context(), s.tn.OrgID.String())
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
	})

	t.Run("should answer 204 and change nothing when the member is already gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())
		require.Equal(t, http.StatusNoContent, s.deleteUser(t, user.ID).status)

		// Action
		r := s.deleteUser(t, user.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
	})

	t.Run("should answer 204 and leave another organization's member in place", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		p := theirs.person()
		other := theirs.provision(t, p)

		// Action
		r := mine.deleteUser(t, other.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		require.NotNil(t, fixture.MembershipOf(t, theirs.tn, p.email))
	})

	t.Run("should answer 204 for an id no membership ever had", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := s.deleteUser(t, uuid.NewString())

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
	})

	t.Run("should refuse to remove the org's last admin and keep them", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		admin := byUserName(s.allUsers(t), s.tn.Admin.Email)

		// Action
		r := s.deleteUser(t, admin.ID)

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "would leave the organization with no admin")
		require.NotNil(t, fixture.MembershipOf(t, s.tn, s.tn.Admin.Email))
	})
}
