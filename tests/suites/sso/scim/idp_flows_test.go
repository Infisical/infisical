package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/stretchr/testify/require"
)

// assign is what Okta and Entra both do when a person is assigned to the app: look
// them up by userName, create them only if the lookup is empty, then make sure the
// group exists and holds them. Running it twice is a re-sync.
func (s *scim) assign(t *testing.T, p person, groupName string, addMember map[string]any) (scimUser, scimGroup) {
	t.Helper()
	var user scimUser
	if found := s.findUsers(t, `userName eq "`+p.userName+`"`); len(found) == 1 {
		user = found[0]
	} else {
		require.Empty(t, found)
		user = s.provision(t, p)
	}

	var group scimGroup
	groups := decode[listResponse[scimGroup]](t, s.listGroups(t, api.ListScimGroupsParams{
		Filter:             new(`displayName eq "` + groupName + `"`),
		ExcludedAttributes: new("members"),
	})).Resources
	if len(groups) == 1 {
		group = groups[0]
	} else {
		require.Empty(t, groups)
		group = s.provisionGroup(t, groupName)
	}

	addMember["value"] = members(user.ID)
	requireOK(t, s.patchGroup(t, group.ID, addMember), "adding the member to the group")
	return user, group
}

func TestScimIdP(t *testing.T) {
	t.Parallel()

	t.Run("should leave one active member in one group when Okta assigns a person twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		oktaAdd := func() map[string]any { return map[string]any{"op": "add", "path": "members"} }
		first, firstGroup := s.assign(t, p, "okta-engineering", oktaAdd())

		// Action
		second, secondGroup := s.assign(t, p, "okta-engineering", oktaAdd())

		// Assert
		require.Equal(t, first.ID, second.ID)
		require.Equal(t, firstGroup.ID, secondGroup.ID)
		require.Equal(t, []string{first.ID}, s.groupMembers(t, firstGroup.ID))
	})

	t.Run("should suspend and restore a member the way Okta does", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user, group := s.assign(t, p, "okta-engineering", map[string]any{"op": "add", "path": "members"})
		requireOK(t, s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false})), "suspending")

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": true}))

		// Assert
		require.True(t, decode[scimUser](t, r).Active)
		require.Equal(t, []string{user.ID}, s.groupMembers(t, group.ID))
	})

	t.Run("should leave one active member in one group when Entra assigns a person twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		entraAdd := func() map[string]any { return map[string]any{"op": "Add", "path": "members"} }
		first, firstGroup := s.assign(t, p, "entra-engineering", entraAdd())

		// Action
		second, secondGroup := s.assign(t, p, "entra-engineering", entraAdd())

		// Assert
		require.Equal(t, first.ID, second.ID)
		require.Equal(t, firstGroup.ID, secondGroup.ID)
		require.Equal(t, []string{first.ID}, s.groupMembers(t, firstGroup.ID))
	})

	t.Run("should update a profile from Entra's string-valued Replace operations", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())

		// Action
		r := s.patchUser(t, user.ID,
			op("Replace", "name.givenName", "Katherine"),
			op("Replace", "name.familyName", "Johnson"),
			op("Replace", "active", "True"))

		// Assert
		requireOK(t, r, "updating the profile")
		got := decode[scimUser](t, s.getUser(t, user.ID))
		require.Equal(t, "Katherine", got.Name.GivenName)
		require.Equal(t, "Johnson", got.Name.FamilyName)
	})

	t.Run("should remove the person entirely when Entra unassigns then deletes them", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user, group := s.assign(t, p, "entra-engineering", map[string]any{"op": "Add", "path": "members"})
		requireOK(t, s.patchUser(t, user.ID, op("Replace", "active", "False")), "soft-deleting")

		// Action
		r := s.deleteUser(t, user.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
		require.Empty(t, s.groupMembers(t, group.ID))
	})
}
