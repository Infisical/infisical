package scim_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestScimUser_Patch(t *testing.T) {
	t.Parallel()

	t.Run("should deactivate the member when Okta replaces active without a path", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.False(t, decode[scimUser](t, r).Active)
		require.False(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should deactivate the member when Entra replaces active with the string False", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("Replace", "active", "False"))

		// Assert
		requireOK(t, r, "deactivating Entra-style")
		require.False(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should reactivate a deactivated member", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		requireOK(t, s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false})), "deactivating")

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": true}))

		// Assert
		require.True(t, decode[scimUser](t, r).Active)
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should rename the member when the given name is replaced by path", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())

		// Action
		r := s.patchUser(t, user.ID, op("replace", "name.givenName", "Amazing"))

		// Assert
		requireOK(t, r, "renaming")
		require.Equal(t, "Amazing", decode[scimUser](t, s.getUser(t, user.ID)).Name.GivenName)
	})

	t.Run("should change the member's email when SSO is enforced", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.enforce(t)
		p := s.person()
		user := s.provision(t, p)
		renamed := s.tn.Email("renamed-" + id.Short())

		// Action
		r := s.patchUser(t, user.ID, op("replace", `emails[type eq "work"].value`, renamed))

		// Assert
		requireOK(t, r, "changing email")
		require.Nil(t, fixture.MembershipOf(t, s.tn, p.email))
		require.Equal(t, user.ID, fixture.MembershipOf(t, s.tn, renamed).ID.String())
	})

	t.Run("should refuse an email change and keep the address when SSO is not enforced", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", `emails[type eq "work"].value`, s.tn.Email("renamed-"+id.Short())))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "Enable SSO enforcement")
		require.NotNil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse with 409 uniqueness when the new email belongs to another account", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		taken := s.tn.NewUser(t)
		s.enforce(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", `emails[type eq "work"].value`, taken.Email))

		// Assert
		require.Equal(t, http.StatusConflict, r.status)
		require.Equal(t, "uniqueness", scimType(t, r))
		require.NotNil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse with 400 invalidValue when the new email is off the org's verified domains", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		s.enforce(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", `emails[type eq "work"].value`, "moved@unverified-"+id.Short()+".test"))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "invalidValue", scimType(t, r))
		require.NotNil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should answer 404 and change nothing for another organization's member", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine := setup(t)
		theirs := setupWith(t, viaSAML, harness.From(t).NewTenant(t))
		p := theirs.person()
		other := theirs.provision(t, p)

		// Action
		r := mine.patchUser(t, other.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
		require.True(t, fixture.MembershipOf(t, theirs.tn, p.email).IsActive)
	})

	t.Run("should answer 404 when the org switched from SAML to OIDC after the user was provisioned", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		user := s.provision(t, s.person())
		res, err := s.tn.Admin.API.UpdateSamlConfigWithResponse(t.Context(), api.UpdateSamlConfigJSONRequestBody{
			OrganizationId: s.tn.OrgID.String(),
			IsActive:       new(false),
		})
		require.NoError(t, err)
		requireOK(t, reply{res.StatusCode(), res.Body}, "deactivating SAML")
		sso.NewOIDCConfig(t, s.tn)
		requireOK(t, setScimEnabled(t, s.tn, true), "re-enabling SCIM")

		// Action
		r := s.patchUser(t, user.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.Equal(t, http.StatusNotFound, r.status)
		require.Equal(t, "User alias not found", errorText(t, r))
	})

	t.Run("should refuse to deactivate the org's last admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		admin := s.ssoLinkedMember(t, s.tn.Admin)

		// Action
		r := s.patchUser(t, admin.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Contains(t, errorText(t, r), "would leave the organization with no admin")
		require.True(t, fixture.MembershipOf(t, s.tn, s.tn.Admin.Email).IsActive)
	})

	t.Run("should refuse to deactivate the org's last admin when Entra sends active as a string", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		admin := s.ssoLinkedMember(t, s.tn.Admin)

		// Action
		r := s.patchUser(t, admin.ID, op("Replace", "active", "False"))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.True(t, fixture.MembershipOf(t, s.tn, s.tn.Admin.Email).IsActive)
	})

	t.Run("should deactivate an admin when another admin remains", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		other := s.ssoLinkedMember(t, s.tn.NewUser(t, harness.OrgRole("admin")))

		// Action
		r := s.patchUser(t, other.ID, op("replace", "", map[string]any{"active": false}))

		// Assert
		requireOK(t, r, "deactivating the second admin")
		require.False(t, fixture.MembershipOf(t, s.tn, other.UserName).IsActive)
	})

	t.Run("should refuse with 400 and leave the member unchanged when the PatchOp path does not parse", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", "name[", "x"), op("replace", "active", false))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.Equal(t, "invalidSyntax", scimType(t, r))
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should accept an email type it does not store and keep the member's email", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("replace", `emails[type eq "home"].value`, "home@example.test"))

		// Assert
		got := decode[scimUser](t, r)
		require.Len(t, got.Emails, 1)
		require.Equal(t, p.email, got.Emails[0].Value)
		require.NotNil(t, fixture.MembershipOf(t, s.tn, p.email))
	})

	t.Run("should refuse a remove that names no path", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.patchUser(t, user.ID, op("remove", "", nil))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, r.status)
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})
}

func TestScimUser_Replace(t *testing.T) {
	t.Parallel()

	t.Run("should find the member under the new userName after a PUT renames it", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		p.userName = "emp-" + id.Short()

		// Action
		r := s.replaceUser(t, user.ID, replaceBody(p, true))

		// Assert
		requireOK(t, r, "replacing the user")
		require.Equal(t, []string{user.ID}, ids(s.findUsers(t, `userName eq "`+p.userName+`"`)))
	})

	t.Run("should deactivate the member when a PUT sends active false", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)

		// Action
		r := s.replaceUser(t, user.ID, replaceBody(p, false))

		// Assert
		require.False(t, decode[scimUser](t, r).Active)
		require.False(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})

	t.Run("should refuse a PUT that deactivates the org's last admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		admin := s.ssoLinkedMember(t, s.tn.Admin)
		p := person{userName: admin.UserName, email: s.tn.Admin.Email, givenName: "Org", familyName: "Admin"}

		// Action
		r := s.replaceUser(t, admin.ID, replaceBody(p, false))

		// Assert
		require.Equal(t, http.StatusBadRequest, r.status)
		require.True(t, fixture.MembershipOf(t, s.tn, s.tn.Admin.Email).IsActive)
	})

	t.Run("should refuse a PUT whose active is not a boolean and keep the member active", func(t *testing.T) {
		t.Parallel()

		// Setup
		s := setup(t)
		p := s.person()
		user := s.provision(t, p)
		body := replaceBody(p, true)
		body["active"] = "False"

		// Action
		r := s.replaceUser(t, user.ID, body)

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, r.status)
		require.True(t, fixture.MembershipOf(t, s.tn, p.email).IsActive)
	})
}
