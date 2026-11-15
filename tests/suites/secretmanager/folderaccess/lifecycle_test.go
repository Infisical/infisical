package folderaccess_test

import (
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolderAccess_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a member granted by a full-access holder read the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext", secretmanager.WithPath("/app"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"), fixture.WithRoles("no-access"))
		reader := proj.NewUser(t, fixture.WithPrincipalName("reader"), fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, owner, at("/app"), secretmanager.FolderFullAccess)
		granted := grantAs(t, owner, proj, reader, at("/app"), secretmanager.FolderRead, nil)
		require.Equalf(t, http.StatusOK, granted.status, "granting as the full-access holder: %s", granted.body)

		// Action
		got := listSecrets(t, reader, proj, "/app", false)

		// Assert
		require.Equalf(t, http.StatusOK, got.status, "listing as the granted member: %s", got.body)
		require.Equal(t, map[string]string{"API_KEY": "plaintext"}, got.values)
	})

	t.Run("should give no access at once when a temporary grant starts in the past and has already ended", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext", secretmanager.WithPath("/app"))
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		start := time.Now().Add(-2 * time.Hour)
		created := grantAs(t, proj.Tenant().Admin, proj, pr, at("/app"), secretmanager.FolderRead,
			map[string]any{"type": temporary("1h", start)})
		require.Equalf(t, http.StatusOK, created.status, "granting: %s", created.body)

		// Action
		got := listSecrets(t, pr, proj, "/app", false)

		// Assert
		require.Equalf(t, http.StatusForbidden, got.status, "listing with an ended grant: %s", got.body)
		require.NotContains(t, string(got.body), "plaintext")
		require.True(t, created.grant.IsTemporary)
		require.NotNil(t, created.grant.TemporaryAccessEndTime)
		require.WithinDuration(t, start.Add(time.Hour), *created.grant.TemporaryAccessEndTime, time.Second)
	})

	t.Run("should make the grant follow a rename of its parent and a move of the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		parentID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/a"))
		secretmanager.CreateFolder(t, proj, "dev", "/a/b")
		secretmanager.CreateFolder(t, proj, "dev", "/dest")
		secretmanager.CreateSecret(t, proj, "dev", "B_KEY", "b-value", secretmanager.WithPath("/a/b"))
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/a/b"), secretmanager.FolderRead)
		renamed, err := proj.Tenant().Admin.API.UpdateSecretFolderWithResponse(t.Context(), parentID.String(),
			api.UpdateSecretFolderJSONRequestBody{ProjectId: proj.ID, Environment: "dev", Name: "renamed", Path: new("/")})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, renamed.StatusCode(), "renaming: %s", apierr.Body(renamed.Body))
		afterRename := listSecrets(t, pr, proj, "/renamed/b", false)

		// Action
		moved, err := proj.Tenant().Admin.API.MoveSecretFolderWithResponse(t.Context(), api.MoveSecretFolderJSONRequestBody{
			ProjectId: proj.ID, FolderId: parentID, DestinationEnvironment: "dev", DestinationPath: new("/dest"),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, moved.StatusCode(), "moving: %s", apierr.Body(moved.Body))

		// Assert
		require.Equalf(t, http.StatusOK, afterRename.status, "listing after the rename: %s", afterRename.body)
		require.Equal(t, map[string]string{"B_KEY": "b-value"}, afterRename.values)
		wait.Until(t, "the grant to apply at the moved path", func() bool {
			return listSecrets(t, pr, proj, "/dest/renamed/b", false).values["B_KEY"] == "b-value"
		})
		stored := grantsOf(t, proj, pr)
		require.Len(t, stored, 1)
		require.Equal(t, "/dest/renamed/b", stored[0].SecretPath)
	})

	t.Run("should remove the grant when its folder or a parent is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/leaf")
		secretmanager.CreateFolder(t, proj, "dev", "/parent/child")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/leaf"), secretmanager.FolderRead)
		secretmanager.GrantFolderAccess(t, proj, pr, at("/parent/child"), secretmanager.FolderRead)

		// Action
		for _, name := range []string{"leaf", "parent"} {
			res, err := proj.Tenant().Admin.API.DeleteSecretFolderWithResponse(t.Context(), name, api.DeleteSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
			})
			require.NoError(t, err)
			require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting %s: %s", name, apierr.Body(res.Body))
		}

		// Assert
		require.Empty(t, grantsOf(t, proj, pr))
	})

	t.Run("should let a member without manage-access rename, move and delete folders that hold someone else's grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		ids := map[string]string{}
		for _, p := range []string{"/rename-me", "/describe-me", "/batch-me", "/move-me", "/move-parent/child",
			"/delete-me", "/delete-parent/child", "/dest"} {
			ids[p] = uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", p)).String()
		}
		ids["/move-parent"] = secretmanager.FolderID(t, proj, "dev", "/", "move-parent")
		holder := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		for _, p := range []string{"/rename-me", "/describe-me", "/batch-me", "/move-me", "/move-parent/child",
			"/delete-me", "/delete-parent/child"} {
			secretmanager.GrantFolderAccess(t, proj, holder, at(p), secretmanager.FolderRead)
		}
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		statuses := map[string]int{}

		// Action
		update := func(op, id, name string, description *string) {
			res, err := member.API.UpdateSecretFolderWithResponse(t.Context(), id, api.UpdateSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Name: name, Path: new("/"), Description: description,
			})
			require.NoError(t, err)
			statuses[op] = res.StatusCode()
		}
		update("rename", ids["/rename-me"], "renamed", nil)
		update("describe", ids["/describe-me"], "describe-me", new("changed by a member"))
		batch := api.UpdateSecretFoldersBatchJSONRequestBody{ProjectId: proj.ID}
		batch.Folders = slices.Grow(batch.Folders, 1)[:1]
		batch.Folders[0].Id, batch.Folders[0].Environment, batch.Folders[0].Name, batch.Folders[0].Path =
			ids["/batch-me"], "dev", "batch-renamed", new("/")
		batched, err := member.API.UpdateSecretFoldersBatchWithResponse(t.Context(), batch)
		require.NoError(t, err)
		statuses["batch rename"] = batched.StatusCode()
		for op, p := range map[string]string{"move": "/move-me", "move a parent": "/move-parent"} {
			res, err := member.API.MoveSecretFolderWithResponse(t.Context(), api.MoveSecretFolderJSONRequestBody{
				ProjectId: proj.ID, FolderId: uuid.MustParse(ids[p]), DestinationEnvironment: "dev", DestinationPath: new("/dest"),
			})
			require.NoError(t, err)
			statuses[op] = res.StatusCode()
		}
		for op, name := range map[string]string{"delete": "delete-me", "delete a parent": "delete-parent"} {
			res, err := member.API.DeleteSecretFolderWithResponse(t.Context(), name, api.DeleteSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
			})
			require.NoError(t, err)
			statuses[op] = res.StatusCode()
		}

		// Assert
		for op, status := range statuses {
			require.Equal(t, http.StatusOK, status, op)
		}
		paths := []string{}
		for _, g := range grantsOf(t, proj, holder) {
			paths = append(paths, g.SecretPath)
		}
		require.ElementsMatch(t, []string{"/renamed", "/describe-me", "/batch-renamed", "/dest/move-me", "/dest/move-parent/child"}, paths)
	})

	t.Run("should let a machine identity without manage-access delete a folder that holds someone else's grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		holder := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
		secretmanager.GrantFolderAccess(t, proj, holder, at("/app"), secretmanager.FolderRead)
		member := proj.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		res, err := member.API.DeleteSecretFolderWithResponse(t.Context(), "app", api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting: %s", apierr.Body(res.Body))
		require.Empty(t, grantsOf(t, proj, holder))
	})

	t.Run("should let a full-access holder rename and move their granted folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/mine"))
		secretmanager.CreateFolder(t, proj, "dev", "/dest")
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.GrantFolderAccess(t, proj, owner, at("/mine"), secretmanager.FolderFullAccess)

		// Action
		renamed, err := owner.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "mine-renamed", Path: new("/"),
		})
		require.NoError(t, err)
		moved, err := owner.API.MoveSecretFolderWithResponse(t.Context(), api.MoveSecretFolderJSONRequestBody{
			ProjectId: proj.ID, FolderId: folderID, DestinationEnvironment: "dev", DestinationPath: new("/dest"),
		})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusOK, renamed.StatusCode(), "renaming: %s", apierr.Body(renamed.Body))
		require.Equalf(t, http.StatusOK, moved.StatusCode(), "moving: %s", apierr.Body(moved.Body))
		stored := grantsOf(t, proj, owner)
		require.Len(t, stored, 1)
		require.Equal(t, "/dest/mine-renamed", stored[0].SecretPath)
	})

	t.Run("should remove a group-only member's access when they leave the group and keep it for a direct member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "plaintext", secretmanager.WithPath("/app"))
		groupOnly := tn.NewUser(t, harness.WithName("grouponly"))
		direct := proj.NewUser(t, fixture.WithPrincipalName("direct"), fixture.WithRoles("no-access"))
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, groupOnly, direct)
		proj.GrantGroup(t, group, "no-access")
		secretmanager.GrantFolderAccess(t, proj, groupOnly, at("/app"), secretmanager.FolderRead)
		secretmanager.GrantFolderAccess(t, proj, direct, at("/app"), secretmanager.FolderRead)
		require.Equal(t, "plaintext", listSecrets(t, groupOnly, proj, "/app", false).values["API_KEY"])

		// Action
		group.RemoveUser(t, groupOnly, direct)

		// Assert
		wait.Until(t, "the group-only member to lose access", func() bool {
			return listSecrets(t, groupOnly, proj, "/app", false).status == http.StatusForbidden
		})
		require.Empty(t, grantsOf(t, proj, groupOnly))
		require.Len(t, grantsOf(t, proj, direct), 1)
		require.Equal(t, "plaintext", listSecrets(t, direct, proj, "/app", false).values["API_KEY"])
	})

	t.Run("should ignore a grant once its holder becomes a project admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		pr := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.GrantFolderAccess(t, proj, pr, at("/app"), secretmanager.FolderRead)
		require.Equal(t, http.StatusForbidden, createSecret(t, pr, proj, "/app", "BEFORE", "v"),
			"the read grant replaces the member role's writes at /app")

		// Action
		setIdentityRoles(t, proj, pr, "admin")

		// Assert
		wait.Until(t, "the promoted admin to write at the granted folder", func() bool {
			return createSecret(t, pr, proj, "/app", "AFTER", "v") == http.StatusOK
		})
		require.Equal(t, map[string]string{"AFTER": "v"}, secretsAt(t, proj, "/app"))
	})
}
