package scim_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func ids(users []scimUser) []string {
	out := make([]string, 0, len(users))
	for _, u := range users {
		out = append(out, u.ID)
	}
	return out
}

func userNames(users []scimUser) []string {
	out := make([]string, 0, len(users))
	for _, u := range users {
		out = append(out, u.UserName)
	}
	return out
}

func byUserName(users []scimUser, userName string) scimUser {
	for _, u := range users {
		if u.UserName == userName {
			return u
		}
	}
	return scimUser{}
}

func TestScimUser_List(t *testing.T) {
	t.Parallel()

	t.Run("should find a provisioned user by userName and nobody for an unknown one", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		found := s.findUsers(t, `userName eq "`+p.userName+`"`)

		// Assert
		require.Equal(t, []string{user.ID}, ids(found))
		require.Empty(t, s.findUsers(t, `userName eq "nobody-`+id.Short()+`@example.test"`))
	})

	t.Run("should match userName case-sensitively", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		s.provision(t, p)

		// Action
		found := s.findUsers(t, `userName eq "`+strings.ToUpper(p.userName)+`"`)

		// Assert
		require.Empty(t, found)
	})

	t.Run("should still find a user by userName after they log in under a different SSO subject", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		s.saml.SPLogin(t, samlidp.Response{NameID: "emp-" + id.Short(), Email: p.email, FirstName: p.givenName, LastName: p.familyName})

		// Action
		found := s.findUsers(t, `userName eq "`+p.userName+`"`)

		// Assert
		require.Equal(t, []string{user.ID}, ids(found))
	})

	t.Run("should list members that were added outside SCIM with their email as userName", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		member := s.tn.NewUser(t)

		// Action
		all := s.allUsers(t)

		// Assert
		require.Contains(t, userNames(all), member.Email)
	})

	t.Run("should link a member added outside SCIM when the IdP provisions them", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		member := s.tn.NewUser(t)
		listed := byUserName(s.allUsers(t), member.Email)

		// Action
		user := s.provision(t, person{userName: member.Email, email: member.Email, givenName: "Grace", familyName: "Hopper"})

		// Assert
		require.Equal(t, listed.ID, user.ID)
		require.Equal(t, []string{user.ID}, ids(s.findUsers(t, `userName eq "`+member.Email+`"`)))
	})

	t.Run("should page through every member once when walking startIndex and count", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		for range 3 {
			s.provision(t, s.person())
		}

		// Action
		first := decode[listResponse[scimUser]](t, s.listUsers(t, api.ListScimUsersParams{StartIndex: new(float32(1)), Count: new(float32(2))}))
		second := decode[listResponse[scimUser]](t, s.listUsers(t, api.ListScimUsersParams{StartIndex: new(float32(3)), Count: new(float32(2))}))

		// Assert
		require.Equal(t, 4, first.TotalResults, "three provisioned users and the tenant admin")
		require.Equal(t, first.TotalResults, second.TotalResults)
		seen := append(ids(first.Resources), ids(second.Resources)...)
		require.Len(t, seen, 4)
		require.ElementsMatch(t, ids(s.allUsers(t)), seen)
	})

	t.Run("should filter on active, given name, prefix, and combined conditions", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		kept, gone := s.person(), s.person()
		gone.givenName = "Ada"
		keptUser, goneUser := s.provision(t, kept), s.provision(t, gone)
		requireOK(t, s.patchUser(t, goneUser.ID, op("replace", "", map[string]any{"active": false})), "deactivating")

		// Action
		inactive := s.findUsers(t, `active eq false`)
		named := s.findUsers(t, `name.givenName eq "Ada"`)
		prefixed := s.findUsers(t, `userName sw "`+kept.userName[:10]+`" and active eq true`)
		either := s.findUsers(t, `userName eq "`+kept.userName+`" or userName eq "`+gone.userName+`"`)

		// Assert
		require.Equal(t, []string{goneUser.ID}, ids(inactive))
		require.Equal(t, []string{goneUser.ID}, ids(named))
		require.Equal(t, []string{keptUser.ID}, ids(prefixed))
		require.ElementsMatch(t, []string{keptUser.ID, goneUser.ID}, ids(either))
	})

	t.Run("should refuse with 400 invalidFilter when the filter does not parse", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := s.listUsers(t, api.ListScimUsersParams{Filter: new(`userName eq`)})

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "invalidFilter", scimType(t, r))
	})

	t.Run("should report itemsPerPage as the number of users on the page", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		page := decode[listResponse[scimUser]](t, s.listUsers(t, api.ListScimUsersParams{Count: new(float32(50))}))

		// Assert
		require.Equal(t, len(page.Resources), page.ItemsPerPage)
	})
}

func TestScimUser_Get(t *testing.T) {
	t.Parallel()

	t.Run("should show a deactivated member as inactive", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())
		requireOK(t, s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false})), "deactivating")

		// Action
		r := s.getUser(t, user.ID)

		// Assert
		require.False(t, decode[scimUser](t, r).Active)
	})

	t.Run("should answer 404 for another organization's member", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		other := theirs.provision(t, theirs.person())

		// Action
		r := mine.getUser(t, other.ID)

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
		require.Equal(t, "User not found", errorText(t, r))
	})

	t.Run("should answer 404 when the id is not a membership id at all", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := s.getUser(t, "not-a-uuid")

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
	})
}
