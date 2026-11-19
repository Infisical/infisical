package folderaccess_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// kind builds the principals a grant rule is checked against, once per actor type the
// folder access routes serve.
type kind struct {
	name  string
	label string
	// member joins the project with the given roles.
	member func(t *testing.T, proj *fixture.Project, roles ...string) *harness.Principal
	// orgOnly is in the organization but not the project.
	orgOnly func(t *testing.T, tn *harness.Tenant) *harness.Principal
	// joinGroup puts the principal in an organization group.
	joinGroup func(t *testing.T, tn *harness.Tenant, g *fixture.Group, pr *harness.Principal)
	// setRoles replaces the principal's project roles.
	setRoles func(t *testing.T, proj *fixture.Project, pr *harness.Principal, roles ...string)
	kind     harness.Kind
}

var kinds = []kind{
	{
		name:  "user",
		label: "User",
		member: func(t *testing.T, proj *fixture.Project, roles ...string) *harness.Principal {
			return proj.NewUser(t, fixture.WithRoles(roles...))
		},
		orgOnly:   func(t *testing.T, tn *harness.Tenant) *harness.Principal { return tn.NewUser(t) },
		joinGroup: func(t *testing.T, _ *harness.Tenant, g *fixture.Group, pr *harness.Principal) { g.AddUser(t, pr) },
		setRoles:  setUserRoles,
		kind:      harness.User,
	},
	{
		name:  "machine identity",
		label: "Machine identity",
		member: func(t *testing.T, proj *fixture.Project, roles ...string) *harness.Principal {
			return proj.NewMachineIdentity(t, fixture.WithRoles(roles...))
		},
		orgOnly:   func(t *testing.T, tn *harness.Tenant) *harness.Principal { return tn.NewMachineIdentity(t) },
		joinGroup: addIdentityToGroup,
		setRoles:  setIdentityRoles,
		kind:      harness.MachineIdentity,
	},
}

func TestFolderAccess_GrantRules(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, k := range kinds {
		t.Run(fmt.Sprintf("should refuse granting or updating a %s with the project admin role", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			admin := k.member(t, proj, "admin")

			// Action
			created := grantAs(t, proj.Tenant().Admin, proj, admin, at("/app"), secretmanager.FolderRead, nil)
			updated := updateGrant(t, proj.Tenant().Admin, proj, admin, at("/app"), map[string]any{"permission": "edit"})

			// Assert
			want := fmt.Sprintf("%s with ID '%s' has the project admin role. Project admins already have full access "+
				"to every folder, so folder access cannot be granted to them.", k.label, admin.ID)
			require.Equalf(t, http.StatusBadRequest, created.status, "granting: %s", created.body)
			require.Equal(t, want, created.message)
			require.Equalf(t, http.StatusBadRequest, updated.status, "updating: %s", updated.body)
			require.Equal(t, want, updated.message)
			require.Empty(t, grantsOf(t, proj, admin))
		})

		t.Run(fmt.Sprintf("should refuse granting a %s whose admin role comes from a group", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := newProject(t, tn)
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			groupAdmin := k.orgOnly(t, tn)
			group := fixture.NewGroup(t, tn)
			k.joinGroup(t, tn, group, groupAdmin)
			proj.GrantGroup(t, group, "admin")

			// Action
			res := grantAs(t, tn.Admin, proj, groupAdmin, at("/app"), secretmanager.FolderRead, nil)

			// Assert
			require.Equalf(t, http.StatusBadRequest, res.status, "granting: %s", res.body)
			require.Contains(t, res.message, "has the project admin role")
			require.Empty(t, grantsOf(t, proj, groupAdmin))
			listed := listAccess(t, tn.Admin, proj, k.kind, at("/app"), page{})
			require.True(t, listed.with[groupAdmin.ID.String()].IsProjectAdmin)
			require.NotContains(t, listed.without, groupAdmin.ID.String())
		})

		t.Run(fmt.Sprintf("should return not found for a %s that is not a project member", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := newProject(t, tn)
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			outsider := k.orgOnly(t, tn)

			// Action
			res := grantAs(t, tn.Admin, proj, outsider, at("/app"), secretmanager.FolderRead, nil)

			// Assert
			require.Equalf(t, http.StatusNotFound, res.status, "granting: %s", res.body)
			require.Equal(t, fmt.Sprintf("%s with ID '%s' is not a member of project with ID '%s'", k.label, outsider.ID, proj.ID),
				res.message)
			require.Empty(t, grantsOf(t, proj, outsider))
		})

		t.Run(fmt.Sprintf("should keep a %s's full-access grant permanent on create and on every update path", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			member := k.member(t, proj, "no-access")
			admin := proj.Tenant().Admin
			expiring := map[string]any{"type": temporary("1h", time.Now())}

			// Action
			temporaryCreate := grantAs(t, admin, proj, member, at("/app"), secretmanager.FolderFullAccess, expiring)
			permanentCreate := grantAs(t, admin, proj, member, at("/app"), secretmanager.FolderFullAccess, nil)
			addExpiry := updateGrant(t, admin, proj, member, at("/app"), expiring)
			lowered := updateGrant(t, admin, proj, member, at("/app"), map[string]any{"permission": "manage", "type": expiring["type"]})
			promoted := updateGrant(t, admin, proj, member, at("/app"), map[string]any{"permission": "full-access"})
			promotedPermanent := updateGrant(t, admin, proj, member, at("/app"),
				map[string]any{"permission": "full-access", "type": map[string]any{"isTemporary": false}})

			// Assert
			const msg = "Folder access with the 'full-access' role cannot be temporary. A full-access holder can grant " +
				"folder access to others, and those grants would outlive the expiration. Grant 'full-access' permanently, " +
				"or use the 'manage' role for temporary access."
			require.Equal(t, http.StatusBadRequest, temporaryCreate.status)
			require.Equal(t, msg, temporaryCreate.message)
			require.Equalf(t, http.StatusOK, permanentCreate.status, "creating permanently: %s", permanentCreate.body)
			require.Equal(t, http.StatusBadRequest, addExpiry.status)
			require.Equal(t, msg, addExpiry.message)
			require.Equalf(t, http.StatusOK, lowered.status, "lowering to a temporary manage: %s", lowered.body)
			require.Equal(t, http.StatusBadRequest, promoted.status)
			require.Equal(t, msg, promoted.message)
			require.Equalf(t, http.StatusOK, promotedPermanent.status, "promoting permanently: %s", promotedPermanent.body)
			stored := grantsOf(t, proj, member)
			require.Len(t, stored, 1)
			require.Equal(t, "full-access", stored[0].Permission)
			require.False(t, stored[0].IsTemporary)
		})

		t.Run(fmt.Sprintf("should refuse a duplicate grant for a %s and keep the first", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			member := k.member(t, proj, "no-access")
			secretmanager.GrantFolderAccess(t, proj, member, at("/app"), secretmanager.FolderRead)

			// Action
			res := grantAs(t, proj.Tenant().Admin, proj, member, at("/app"), secretmanager.FolderEdit, nil)

			// Assert
			require.Equalf(t, http.StatusBadRequest, res.status, "granting again: %s", res.body)
			require.Equal(t, fmt.Sprintf("%s with ID '%s' already has folder access on this folder with the 'edit' role "+
				"or another one. Update the existing access instead of creating a new one.", k.label, member.ID), res.message)
			stored := grantsOf(t, proj, member)
			require.Len(t, stored, 1)
			require.Equal(t, "read", stored[0].Permission)
		})

		t.Run(fmt.Sprintf("should refuse a %s grant on an unknown path, unknown environment or malformed path", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			member := k.member(t, proj, "no-access")
			admin := proj.Tenant().Admin

			// Action
			unknownPath := grantAs(t, admin, proj, member, at("/missing"), secretmanager.FolderRead, nil)
			unknownEnv := grantAs(t, admin, proj, member, secretmanager.Location{Env: "qa", Path: "/"}, secretmanager.FolderRead, nil)
			malformed := grantAs(t, admin, proj, member, at("/bad name!"), secretmanager.FolderRead, nil)

			// Assert
			require.Equal(t, http.StatusNotFound, unknownPath.status)
			require.Equal(t, fmt.Sprintf("Folder at path '/missing' not found in environment with slug 'dev' in project with ID '%s'", proj.ID),
				unknownPath.message)
			require.Equal(t, http.StatusNotFound, unknownEnv.status)
			require.Equalf(t, http.StatusBadRequest, malformed.status, "granting on a malformed path: %s", malformed.body)
			require.Empty(t, grantsOf(t, proj, member))
		})

		t.Run(fmt.Sprintf("should normalize a trailing slash on a %s grant and its revoke", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
			member := k.member(t, proj, "no-access")

			// Action
			created := grantAs(t, proj.Tenant().Admin, proj, member, at("/app/"), secretmanager.FolderRead, nil)
			revoked := revokeGrant(t, proj.Tenant().Admin, proj, member, at("/app/"))

			// Assert
			require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)
			require.Equal(t, "/app", created.grant.SecretPath)
			require.Equal(t, folderID.String(), created.grant.FolderID)
			require.Equalf(t, http.StatusOK, revoked.status, "revoking: %s", revoked.body)
			require.Equal(t, created.grant.ID, revoked.grant.ID)
			require.Empty(t, grantsOf(t, proj, member))
		})

		t.Run(fmt.Sprintf("should update a %s's grant between temporary and permanent and revoke it once", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
			member := k.member(t, proj, "no-access")
			admin := proj.Tenant().Admin
			created := grantAs(t, admin, proj, member, at("/app"), secretmanager.FolderRead, nil)
			require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)
			start := time.Now().UTC().Truncate(time.Millisecond)

			// Action
			toTemporary := updateGrant(t, admin, proj, member, at("/app"),
				map[string]any{"permission": "edit", "type": temporary("4h", start)})
			toPermanent := updateGrant(t, admin, proj, member, at("/app"), map[string]any{"type": map[string]any{"isTemporary": false}})
			empty := updateGrant(t, admin, proj, member, at("/app"), nil)
			revoked := revokeGrant(t, admin, proj, member, at("/app"))
			revokedAgain := revokeGrant(t, admin, proj, member, at("/app"))

			// Assert
			require.Equal(t, grant{
				ID: created.grant.ID, FolderID: folderID.String(), Permission: "read", Environment: "dev", SecretPath: "/app",
			}, created.grant)
			require.Equalf(t, http.StatusOK, toTemporary.status, "making it temporary: %s", toTemporary.body)
			require.Equal(t, "edit", toTemporary.grant.Permission)
			require.True(t, toTemporary.grant.IsTemporary)
			require.Equal(t, "relative", *toTemporary.grant.TemporaryMode)
			require.Equal(t, "4h", *toTemporary.grant.TemporaryRange)
			require.True(t, start.Equal(*toTemporary.grant.TemporaryAccessStartTime))
			require.Equal(t, 4*time.Hour, toTemporary.grant.TemporaryAccessEndTime.Sub(*toTemporary.grant.TemporaryAccessStartTime))
			require.Equalf(t, http.StatusOK, toPermanent.status, "making it permanent: %s", toPermanent.body)
			require.Equal(t, grant{
				ID: created.grant.ID, FolderID: folderID.String(), Permission: "edit", Environment: "dev", SecretPath: "/app",
			}, toPermanent.grant)
			require.Equal(t, http.StatusUnprocessableEntity, empty.status)
			require.Equalf(t, http.StatusOK, revoked.status, "revoking: %s", revoked.body)
			require.Equal(t, created.grant.ID, revoked.grant.ID)
			require.Equal(t, http.StatusNotFound, revokedAgain.status)
			require.Equal(t, fmt.Sprintf("No folder access found for %s with ID '%s' on the folder at path '/app' in environment with slug 'dev'",
				strings.ToLower(k.label), member.ID), revokedAgain.message)
			require.Empty(t, grantsOf(t, proj, member))
		})

		t.Run(fmt.Sprintf("should list every grant a %s holds across the project, sorted by path", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/alpha")
			secretmanager.CreateFolder(t, proj, "dev", "/beta")
			member := k.member(t, proj, "no-access")
			before := grantsOf(t, proj, member)
			start := time.Now().UTC().Truncate(time.Millisecond)
			secretmanager.GrantFolderAccess(t, proj, member, at("/beta"), secretmanager.FolderList)
			temp := grantAs(t, proj.Tenant().Admin, proj, member, at("/alpha"), secretmanager.FolderManage,
				map[string]any{"type": temporary("30m", start)})
			require.Equalf(t, http.StatusOK, temp.status, "granting temporarily: %s", temp.body)

			// Action
			got := grantsOf(t, proj, member)

			// Assert
			require.Empty(t, before)
			require.Len(t, got, 2)
			require.Equal(t, []string{"/alpha", "/beta"}, []string{got[0].SecretPath, got[1].SecretPath})
			require.Equal(t, "manage", got[0].Permission)
			require.True(t, got[0].IsTemporary)
			require.Equal(t, "30m", *got[0].TemporaryRange)
			require.True(t, start.Equal(*got[0].TemporaryAccessStartTime))
			require.Equal(t, "list", got[1].Permission)
			require.False(t, got[1].IsTemporary)
			require.Nil(t, got[1].TemporaryRange)
		})

		t.Run(fmt.Sprintf("should grant and revoke a %s on the root folder", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			member := k.member(t, proj, "no-access")

			// Action
			created := grantAs(t, proj.Tenant().Admin, proj, member, at("/"), secretmanager.FolderRead, nil)
			revoked := revokeGrant(t, proj.Tenant().Admin, proj, member, at("/"))

			// Assert
			require.Equalf(t, http.StatusOK, created.status, "granting on the root: %s", created.body)
			require.Equal(t, "/", created.grant.SecretPath)
			require.Equalf(t, http.StatusOK, revoked.status, "revoking on the root: %s", revoked.body)
			require.Empty(t, grantsOf(t, proj, member))
		})

		t.Run(fmt.Sprintf("should still revoke a %s's grant after they become a project admin, but not update it", k.name), func(t *testing.T) {
			t.Parallel()

			// Setup
			proj := newProject(t, h.NewTenant(t))
			secretmanager.CreateFolder(t, proj, "dev", "/app")
			member := k.member(t, proj, "member")
			secretmanager.GrantFolderAccess(t, proj, member, at("/app"), secretmanager.FolderRead)
			k.setRoles(t, proj, member, "admin")

			// Action
			updated := updateGrant(t, proj.Tenant().Admin, proj, member, at("/app"), map[string]any{"permission": "edit"})
			revoked := revokeGrant(t, proj.Tenant().Admin, proj, member, at("/app"))

			// Assert
			require.Equal(t, http.StatusBadRequest, updated.status)
			require.Contains(t, updated.message, "has the project admin role")
			require.Equalf(t, http.StatusOK, revoked.status, "revoking: %s", revoked.body)
			require.Empty(t, grantsOf(t, proj, member))
		})
	}

	t.Run("should refuse an unknown tier", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))

		// Action
		res := grantAs(t, proj.Tenant().Admin, proj, member, at("/app"), secretmanager.FolderTier("owner"), nil)

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, res.status, "granting an unknown tier: %s", res.body)
		require.Empty(t, grantsOf(t, proj, member))
	})

	t.Run("should not resolve a folder grant through the legacy user privilege endpoint", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithRoles("no-access"))
		created := grantAs(t, proj.Tenant().Admin, proj, member, at("/app"), secretmanager.FolderRead, nil)
		require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)

		// Action
		res, err := proj.Tenant().Admin.API.GetUserProjectAdditionalPrivilegeWithResponse(t.Context(), created.grant.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "reading the grant as a privilege: %s", res.Body)
	})

	t.Run("should refuse a grant on a reserved replication folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		member := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		importID := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"}, secretmanager.Replicated())
		reserved := at("/__reserve_replication_" + importID)

		// Action
		res, err := wait.For(t.Context(), func(context.Context) (reply, bool, error) {
			got := grantAs(t, proj.Tenant().Admin, proj, member, reserved, secretmanager.FolderRead, nil)
			return got, got.status != http.StatusNotFound, nil
		})

		// Assert
		require.NoError(t, err, "waiting for the replication folder to exist")
		require.Equalf(t, http.StatusBadRequest, res.status, "granting on the reserved folder: %s", res.body)
		require.Equal(t, "Folder access cannot be granted on a reserved system folder.", res.message)
		require.Empty(t, grantsOf(t, proj, member))
	})

	t.Run("should refuse a caller without project access before resolving the folder, so paths cannot be probed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		outsider := tn.NewUser(t, harness.WithName("outsider"))

		// Action
		statuses := map[string]int{}
		for name, loc := range map[string]secretmanager.Location{
			"existing path": at("/app"),
			"missing path":  at("/missing"),
			"missing env":   {Env: "qa", Path: "/app"},
		} {
			statuses["list on "+name] = listUsersAs(t, outsider, proj, loc, "").status
			statuses["grant on "+name] = grantAs(t, outsider, proj, member, loc, secretmanager.FolderRead, nil).status
		}
		grantsStatus, _ := listGrantsAs(t, outsider, proj, member)
		statuses["list a member's grants"] = grantsStatus

		// Assert
		for name, status := range statuses {
			require.Equal(t, http.StatusForbidden, status, name)
		}
		require.Empty(t, grantsOf(t, proj, member))
	})
}

func addIdentityToGroup(t *testing.T, tn *harness.Tenant, g *fixture.Group, pr *harness.Principal) {
	t.Helper()
	res, err := tn.Admin.API.AddMachineIdentityToGroupWithResponse(t.Context(), g.ID.String(), pr.ID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "adding %s to group %s: %s", pr.Name, g.Name, apierr.Body(res.Body))
}

func setIdentityRoles(t *testing.T, proj *fixture.Project, pr *harness.Principal, roles ...string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.UpdateProjectIdentityMembershipWithBodyWithResponse(t.Context(), proj.ID, pr.ID.String(),
		"application/json", bytes.NewReader(rolesBody(t, roles)))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "setting %s's roles: %s", pr.Name, apierr.Body(res.Body))
}

func setUserRoles(t *testing.T, proj *fixture.Project, pr *harness.Principal, roles ...string) {
	t.Helper()
	membership, err := proj.Tenant().Admin.API.GetProjectMembershipByUserIdWithResponse(t.Context(), uuid.MustParse(proj.ID), pr.ID)
	require.NoError(t, err)
	require.NotNilf(t, membership.JSON200, "reading %s's membership returned %d: %s", pr.Name, membership.StatusCode(),
		apierr.Body(membership.Body))
	res, err := proj.Tenant().Admin.API.UpdateProjectMembershipWithBodyWithResponse(t.Context(), proj.ID,
		membership.JSON200.Membership.Id.String(), "application/json", bytes.NewReader(rolesBody(t, roles)))
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "setting %s's roles: %s", pr.Name, apierr.Body(res.Body))
}

func rolesBody(t *testing.T, roles []string) []byte {
	t.Helper()
	items := make([]map[string]any, 0, len(roles))
	for _, r := range roles {
		items = append(items, map[string]any{"role": r, "isTemporary": false})
	}
	raw, err := json.Marshal(map[string]any{"roles": items})
	require.NoError(t, err)
	return raw
}
