package access_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

const assumeCookie = "infisical-project-assume-privileges"

func assumeIdentity(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal) *api.AssumeProjectPrivilegesResponse {
	t.Helper()
	res, err := actor.API.AssumeProjectPrivilegesWithResponse(t.Context(), proj.ID, api.AssumeProjectPrivilegesJSONRequestBody{
		ActorType: api.AssumeProjectPrivilegesJSONBodyActorType("identity"),
		ActorId:   target.ID.String(),
	})
	require.NoError(t, err)
	return res
}

func sessionCookie(res *http.Response) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == assumeCookie {
			return c
		}
	}
	return nil
}

// startSession assumes the target's privileges and returns the cookie a browser would
// send back on later calls.
func startSession(t *testing.T, actor *harness.Principal, proj *fixture.Project, target *harness.Principal) *http.Cookie {
	t.Helper()
	res := assumeIdentity(t, actor, proj, target)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	cookie := sessionCookie(res.HTTPResponse)
	require.NotNil(t, cookie, "assuming privileges set no session cookie")
	return cookie
}

func withCookie(c *http.Cookie) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		req.AddCookie(c)
		return nil
	}
}

func TestAssumePrivilege_Session(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should give the admin exactly the target's access in that project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "value")
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		session := startSession(t, tn.Admin, proj, viewer)

		// Action
		created := createSecret(t, tn.Admin.API, proj, "dev", "/", "NEW", "value", withCookie(session))

		// Assert
		require.Equal(t, http.StatusForbidden, created.StatusCode())
		listed := listSecrets(t, tn.Admin.API, proj, "dev", "/", withCookie(session))
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Equal(t, []string{"EXISTING"}, keysOf(listed))
		perms, err := tn.Admin.API.GetProjectPermissionsV1WithResponse(t.Context(), proj.ID, withCookie(session))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, perms.StatusCode(), perms.Body)
		require.NotNil(t, perms.JSON200.Data.AssumedPrivilegeDetails)
		require.Equal(t, viewer.ID.String(), perms.JSON200.Data.AssumedPrivilegeDetails.ActorId)
	})

	t.Run("should leave the admin's own access in another project while a session is open", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		assumed := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		session := startSession(t, tn.Admin, assumed, assumed.NewMachineIdentity(t, fixture.WithRoles("viewer")))

		// Action
		created := createSecret(t, tn.Admin.API, other, "dev", "/", "NEW", "value", withCookie(session))

		// Assert
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, other, "dev", "NEW").Value)
	})

	t.Run("should clear the session cookie, restore the admin's own access and record the session when it ends", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		session := startSession(t, tn.Admin, proj, viewer)

		// Action
		ended, err := tn.Admin.API.DeleteAssumedProjectPrivilegesWithResponse(t.Context(), proj.ID, withCookie(session))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, ended.StatusCode(), ended.Body)
		cleared := sessionCookie(ended.HTTPResponse)
		require.NotNil(t, cleared, "ending the session did not reset the cookie")
		require.Empty(t, cleared.Value)
		created := createSecret(t, tn.Admin.API, proj, "dev", "/", "NEW", "value")
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		perms, err := tn.Admin.API.GetProjectPermissionsV1WithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, perms.StatusCode(), perms.Body)
		require.Nil(t, perms.JSON200.Data.AssumedPrivilegeDetails)
		forTarget := func(m map[string]any) bool { return m["targetActorId"] == viewer.ID.String() }
		started := auditEvent(t, tn, "project-assume-privileges-session-start", forTarget)
		require.Equal(t, proj.ID, started["projectId"])
		require.Equal(t, tn.Admin.ID.String(), started["requesterId"])
		finished := auditEvent(t, tn, "project-assume-privileges-session-end", forTarget)
		require.Equal(t, proj.ID, finished["projectId"])
		require.Equal(t, tn.Admin.ID.String(), finished["requesterId"])
	})

	t.Run("should refuse assuming an identity that is not a member of the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		outsider := tn.NewMachineIdentity(t)

		// Action
		res := assumeIdentity(t, tn.Admin, proj, outsider)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Nil(t, sessionCookie(res.HTTPResponse))
	})

	t.Run("should refuse assuming privileges without the assume-privileges permission", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		member := proj.NewUser(t, fixture.WithRoles("member"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res := assumeIdentity(t, member, proj, viewer)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Nil(t, sessionCookie(res.HTTPResponse))
	})
}
