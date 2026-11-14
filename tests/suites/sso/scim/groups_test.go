package scim_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// granted is a project that grants g access, holding one secret to read.
func granted(t *testing.T, s *scim, g scimGroup) *fixture.Project {
	t.Helper()
	proj := fixture.NewProject(t, s.tn, fixture.WithProjectType("secret-manager"))
	secretmanager.CreateSecret(t, proj, proj.Environments[0], "DB_URL", "postgres://")
	proj.GrantGroup(t, asGroup(g))
	return proj
}

// member is a provisioned person who has already signed in, with their session.
func (s *scim) member(t *testing.T) (scimUser, *api.ClientWithResponses) {
	t.Helper()
	p := s.person()
	user := s.provision(t, p)
	return user, s.session(t, p)
}

// requireAccessRevoked waits for the session to lose project access. Revocation is not
// immediate: a cached project permission is trusted until its 10s marker expires.
func requireAccessRevoked(t *testing.T, session *api.ClientWithResponses, proj *fixture.Project) {
	t.Helper()
	wait.Until(t, "project access to be revoked", func() bool {
		return readsSecrets(t, session, proj) == http.StatusForbidden
	}, wait.Timeout(15*time.Second), wait.Interval(time.Second))
}

func setRoleMapping(t *testing.T, tn *harness.Tenant, group, role string) {
	t.Helper()
	body := api.UpdateExternalGroupOrgRoleMappingsJSONRequestBody{}
	body.Mappings = append(body.Mappings, struct {
		GroupName string `json:"groupName"`
		RoleSlug  string `json:"roleSlug"`
	}{GroupName: group, RoleSlug: role})
	res, err := tn.Admin.API.UpdateExternalGroupOrgRoleMappingsWithResponse(t.Context(), body)
	require.NoError(t, err)
	requireOK(t, reply{res.StatusCode(), res.Body}, "mapping group to role")
}

func TestScimGroup_Create(t *testing.T) {
	t.Parallel()

	t.Run("should give members the project access granted to the group", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user, session := s.member(t)

		// Action
		g := s.provisionGroup(t, "engineering", user.ID)

		// Assert
		require.Equal(t, http.StatusOK, readsSecrets(t, session, granted(t, s, g)))
	})

	t.Run("should refuse with 409 when a group with that name exists, even one an admin created", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		existing := fixture.NewGroup(t, s.tn)

		// Action
		r := s.createGroup(t, existing.Name)

		// Assert
		require.Equal(t, http.StatusConflict, r.status)
		require.Contains(t, errorText(t, r), "already exists")
		require.Len(t, decode[listResponse[scimGroup]](t, s.listGroups(t, api.ListScimGroupsParams{})).Resources, 1)
	})

	t.Run("should leave out members that do not belong to the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		outsider := theirs.provision(t, theirs.person())

		// Action
		g := s.provisionGroup(t, "engineering", outsider.ID)

		// Assert
		require.Empty(t, s.groupMembers(t, g.ID))
	})

	t.Run("should give invited members the org role the group maps to", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		setRoleMapping(t, s.tn, "platform-admins", "admin")
		p := s.person()
		user := s.provision(t, p)

		// Action
		s.provisionGroup(t, "platform-admins", user.ID)

		// Assert
		require.Equal(t, "admin", fixture.MembershipOf(t, s.tn, p.email).Role)
	})

	t.Run("should refuse when the plan does not include groups", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setupWith(t, viaSAML, harness.From(t).NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.Groups))))

		// Action
		r := s.createGroup(t, "engineering")

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "Upgrade plan to create a SCIM group")
	})
}

func TestScimGroup_List(t *testing.T) {
	t.Parallel()

	t.Run("should find a group by displayName and leave out members when asked", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())
		g := s.provisionGroup(t, "engineering", user.ID)
		s.provisionGroup(t, "design")

		// Action
		r := s.listGroups(t, api.ListScimGroupsParams{Filter: new(`displayName eq "engineering"`), ExcludedAttributes: new("members")})

		// Assert
		found := decode[listResponse[scimGroup]](t, r).Resources
		require.Len(t, found, 1)
		require.Equal(t, g.ID, found[0].ID)
		require.Empty(t, found[0].Members)
	})

	t.Run("should page through every group once when walking startIndex and count", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		for range 3 {
			s.provisionGroup(t, "g-"+id.Short())
		}

		// Action
		first := decode[listResponse[scimGroup]](t, s.listGroups(t, api.ListScimGroupsParams{StartIndex: new(float32(1)), Count: new(float32(2))}))
		second := decode[listResponse[scimGroup]](t, s.listGroups(t, api.ListScimGroupsParams{StartIndex: new(float32(3)), Count: new(float32(2))}))

		// Assert
		require.Equal(t, 3, first.TotalResults)
		require.Len(t, first.Resources, 2)
		require.Len(t, second.Resources, 1)
		require.NotContains(t, []string{first.Resources[0].ID, first.Resources[1].ID}, second.Resources[0].ID)
	})

	t.Run("should find a group whose name contains eq", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		g := s.provisionGroup(t, "Requests")

		// Action
		r := s.listGroups(t, api.ListScimGroupsParams{Filter: new(`displayName eq "Requests"`)})

		// Assert
		found := decode[listResponse[scimGroup]](t, r).Resources
		require.Len(t, found, 1)
		require.Equal(t, g.ID, found[0].ID)
	})

	t.Run("should still list groups when the plan no longer includes groups", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.provisionGroup(t, "engineering")
		s.tn.SetPlan(t, license.Enterprise().Without(license.Groups))

		// Action
		r := s.listGroups(t, api.ListScimGroupsParams{})

		// Assert
		require.Len(t, decode[listResponse[scimGroup]](t, r).Resources, 1)
	})
}

func TestScimGroup_Get(t *testing.T) {
	t.Parallel()

	t.Run("should answer 404 for another organization's group", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		g := theirs.provisionGroup(t, "engineering")

		// Action
		r := mine.getGroup(t, g.ID, nil)

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
		require.Equal(t, "Group Not Found", errorText(t, r))
	})

	t.Run("should answer 404 when the id is not a group id at all", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := s.getGroup(t, "not-a-uuid", nil)

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
	})

	t.Run("should refuse with 400 invalidFilter when the group filter is not supported", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)

		// Action
		r := s.listGroups(t, api.ListScimGroupsParams{Filter: new(`displayName sw "eng"`)})

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "invalidFilter", scimType(t, r))
	})
}

func TestScimGroup_Patch(t *testing.T) {
	t.Parallel()

	t.Run("should grant project access when Entra adds a member", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user, session := s.member(t)
		g := s.provisionGroup(t, "engineering")
		proj := granted(t, s, g)
		require.Equal(t, http.StatusForbidden, readsSecrets(t, session, proj), "no access before joining")

		// Action
		r := s.patchGroup(t, g.ID, op("Add", "members", members(user.ID)))

		// Assert
		requireOK(t, r, "adding a member")
		require.Equal(t, http.StatusOK, readsSecrets(t, session, proj))
	})

	t.Run("should revoke project access when Okta removes a member by filter", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user, session := s.member(t)
		g := s.provisionGroup(t, "engineering", user.ID)
		proj := granted(t, s, g)
		require.Equal(t, http.StatusOK, readsSecrets(t, session, proj), "the member reads secrets before removal")

		// Action
		r := s.patchGroup(t, g.ID, op("remove", `members[value eq "`+user.ID+`"]`, nil))

		// Assert
		requireOK(t, r, "removing a member")
		requireAccessRevoked(t, session, proj)
	})

	t.Run("should empty the group when every member is removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		a, b := s.provision(t, s.person()), s.provision(t, s.person())
		g := s.provisionGroup(t, "engineering", a.ID, b.ID)

		// Action
		r := s.patchGroup(t, g.ID, op("remove", "members", nil))

		// Assert
		requireOK(t, r, "removing all members")
		require.Empty(t, s.groupMembers(t, g.ID))
	})

	t.Run("should rename the group and keep its role mapping pointed at it", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		setRoleMapping(t, s.tn, "platform", "admin")
		g := s.provisionGroup(t, "platform")

		// Action
		r := s.patchGroup(t, g.ID, op("replace", "", map[string]any{"id": g.ID, "displayName": "platform-eng"}))

		// Assert
		require.Equal(t, "platform-eng", decode[scimGroup](t, r).DisplayName)
		res, err := s.tn.Admin.API.ListExternalGroupOrgRoleMappingsWithResponse(t.Context())
		require.NoError(t, err)
		require.Len(t, *res.JSON200, 1)
		require.Equal(t, "platform-eng", (*res.JSON200)[0].GroupName)
	})

	t.Run("should refuse with 409 when renamed onto another group's name", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.provisionGroup(t, "design")
		g := s.provisionGroup(t, "engineering")

		// Action
		r := s.patchGroup(t, g.ID, op("Replace", "displayName", "design"))

		// Assert
		require.Equal(t, http.StatusConflict, r.status)
		require.Equal(t, "engineering", decode[scimGroup](t, s.getGroup(t, g.ID, nil)).DisplayName)
	})
}

func TestScimGroup_Replace(t *testing.T) {
	t.Parallel()

	t.Run("should make the members exactly the ones sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		a, b, c := s.provision(t, s.person()), s.provision(t, s.person()), s.provision(t, s.person())
		g := s.provisionGroup(t, "engineering", a.ID, b.ID)

		// Action
		r := s.replaceGroup(t, g.ID, "engineering", b.ID, c.ID)

		// Assert
		requireOK(t, r, "replacing the group")
		require.ElementsMatch(t, []string{b.ID, c.ID}, s.groupMembers(t, g.ID))
	})

	t.Run("should answer with only the members that were applied", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		g := s.provisionGroup(t, "engineering")
		stranger := uuid.NewString()

		// Action
		r := s.replaceGroup(t, g.ID, "engineering", stranger)

		// Assert
		require.Empty(t, decode[scimGroup](t, r).Members)
	})
}

func TestScimGroup_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should revoke the project access the group granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user, session := s.member(t)
		g := s.provisionGroup(t, "engineering", user.ID)
		proj := granted(t, s, g)
		require.Equal(t, http.StatusOK, readsSecrets(t, session, proj), "the member reads secrets before the delete")

		// Action
		r := s.deleteGroup(t, g.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		requireAccessRevoked(t, session, proj)
	})

	t.Run("should answer 204 and leave another organization's group in place", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		g := theirs.provisionGroup(t, "engineering")

		// Action
		r := mine.deleteGroup(t, g.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
		requireOK(t, theirs.getGroup(t, g.ID, nil), "reading the other org's group")
	})

	t.Run("should still delete a group when the plan no longer includes groups", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		g := s.provisionGroup(t, "engineering")
		s.tn.SetPlan(t, license.Enterprise().Without(license.Groups))

		// Action
		r := s.deleteGroup(t, g.ID)

		// Assert
		require.Equal(t, http.StatusNoContent, r.status)
	})
}
